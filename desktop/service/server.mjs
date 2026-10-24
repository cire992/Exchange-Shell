import http from 'node:http';
import path from 'node:path';
import { stat, realpath } from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { Sessions } from './sessions.mjs';
import { Files, serveFile } from './files.mjs';
import { importFile, dragFiles, moveFile, recyclePath, MAX_FILE_BYTES } from './file-transfers.mjs';
import { inventory } from './agents.mjs';
import { Attachments, attachmentText, MAX_IMAGE_BYTES } from './attachments.mjs';
import { ContextLibrary } from './context.mjs';
import { groupLabel } from './titles.mjs';
import { NativeSettings } from './native-settings.mjs';
import { McpInventory } from './mcp.mjs';
import { body, equalSecret, json, publicError, readJson, realFile, saveJson, secret } from './util.mjs';
import { ProjectAdapterRegistry } from './project-adapters/registry.mjs';
import { KnowledgeManager, MarkdownKnowledgeProvider } from './knowledge/providers.mjs';
import { IntegrationManager } from './integrations/manager.mjs';
import { ConversationTranscripts } from './mobile-transcript.mjs';
import { ConversationMedia } from './conversation-media.mjs';
import { projectKey, recentProjects } from './recent-projects.mjs';
import { answerPrompt, readPrompt } from './terminal-prompt.mjs';
import { rewindToMessage } from './message-edit.mjs';
import { Handoffs } from './handoff.mjs';
import { chatCommands } from './chat-commands.mjs';

const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });

export async function createService({ repo, uiDir, stateDir, token = secret(), native = () => {}, restoreSessions = false, mcpOptions }) {
  repo = await realpath(repo);
  stateDir ||= path.join(repo, '.mrmak');
  const files = new Files(repo);
  const attachments = new Attachments(repo);
  const library = new ContextLibrary(repo);
  const knowledgeSources = await readJson(path.join(stateDir, 'knowledge-sources.json'), []);
  const knowledgeProviders = (Array.isArray(knowledgeSources) ? knowledgeSources : []).filter(item => typeof item?.root === 'string').map(item => new MarkdownKnowledgeProvider(item.root, { id: item.id, label: item.label }));
  const knowledge = new KnowledgeManager(library, knowledgeProviders);
  const projects = new ProjectAdapterRegistry();
  const integrations = await new IntegrationManager(stateDir).init();
  const mcp = new McpInventory(repo, mcpOptions);
  const sessions = await new Sessions(repo, stateDir).init();
  const transcripts = new ConversationTranscripts();
  const conversationMedia = new ConversationMedia();
  const settingsPath = path.join(stateDir, 'settings.json');
  // Settings saved by removed features (voice, coordinator, dictation, card routes) are dropped on load.
  const { coordinatorModel, coordinatorEffort, voiceName, voiceStyle, transcribeProvider, workspaceRoute, ...savedSettings } = await readJson(settingsPath, {}) || {};
  let settings = { defaultAgent: 'codex', defaultBypass: false, terminalFontSize: 13, terminalAppearance: 'original', workspaceTheme: 'dark', handoffAfter: 40, groupTabsByProject: false, systemEvents: 'compact', ...savedSettings };
  const projectList = () => recentProjects({ repo, sessions: sessions.list(), pinned: settings.pinnedProjects || [] });
  let selectedId = sessions.active().some(item => item.id === settings.selectedId) ? settings.selectedId : sessions.active()[0]?.id || null;
  let settingsTimer;
  let settingsSave = Promise.resolve();
  const saveSettings = () => { settingsSave = settingsSave.catch(() => {}).then(() => saveJson(settingsPath, settings)); return settingsSave; };
  const scheduleSettings = () => { clearTimeout(settingsTimer); settingsTimer = setTimeout(() => saveSettings().catch(() => {}), 500); };
  let closing = false;
  const clients = new Set();
  const notices = [];
  const send = (ws, type, value) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...value })); };
  const broadcast = (type, value) => { for (const ws of clients) send(ws, type, value); };
  const nativeSettings = new NativeSettings(native, value => broadcast('native-settings', value));
  const show = (window, extra = {}) => { native({ type: 'window', action: 'show', window }); broadcast('navigate', { window, ...extra }); };
  const focus = id => { sessions.get(id); selectedId = id; settings.selectedId = id; scheduleSettings(); show('chats', { sessionId: id }); return { selectedId: id }; };
  const history = query => sessions.list().filter(item => !query || `${item.name} ${item.agent} ${item.cwd} ${item.preview || ''}`.normalize('NFC').toLowerCase().includes(query.normalize('NFC').toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const closeChat = async id => {
    await sessions.remove(id);
    if (selectedId === id) { selectedId = sessions.active()[0]?.id || null; settings.selectedId = selectedId; scheduleSettings(); broadcast('selection', { selectedId }); }
    return { closed: true, savedInHistory: true };
  };
  const handoffs = new Handoffs({ repo, sessions, transcripts, opened: id => focus(id), changed: (id, handoff) => broadcast('handoff', { id, handoff }) });
  const attach = async (id, paths) => {
    const session = sessions.get(id);
    const verified = await attachments.paths(paths);
    sessions.input(id, attachmentText(verified, session.agent), { submit: false });
    return { attached: verified, submitted: false };
  };
  sessions.on('session', session => { broadcast('session', { session }); integrations.publish('session', { event: session.status, session }).catch(() => {}); });
  sessions.on('screen-cleared', ({ id }) => broadcast('screen-cleared', { id }));
  sessions.on('service-error', error => broadcast('service-error', { error: publicError(error) }));
  sessions.on('output', output => {
    for (const ws of clients) {
      if (ws.sessionId !== output.id) continue;
      if (ws.bufferedAmount > 2 * 1024 * 1024) { ws.close(1013, 'Reconnect to restore the terminal screen'); continue; }
      send(ws, 'output', output);
    }
  });
  sessions.on('notice', notice => { notices.push(notice); if (notices.length > 100) notices.shift(); broadcast('notice', { notice }); if (notice.kind === 'turn-completed' || notice.kind === 'exit') integrations.publish('completion', notice).catch(() => {}); });

  const contentServer = http.createServer(async (request, response) => {
    try {
      if (request.headers.host !== new URL(files.origin).host || !['GET', 'HEAD'].includes(request.method)) throw Object.assign(new Error('Not allowed'), { status: 403 });
      await files.content(request, response, new URL(request.url, files.origin));
    } catch (error) { if (!response.headersSent) json(response, error.status || 404, { error: publicError(error) }); }
  });
  files.origin = await listen(contentServer);

  function authorize(request) {
    if (request.headers.host !== new URL(origin).host) throw Object.assign(new Error('Unexpected host'), { status: 403 });
    if (request.headers.origin && request.headers.origin !== origin) throw Object.assign(new Error('Unexpected origin'), { status: 403 });
    if (!equalSecret(request.headers.authorization, `Bearer ${token}`)) throw Object.assign(new Error('Open Exchange from its desktop launcher'), { status: 401 });
  }
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      if (request.headers.host !== new URL(origin).host) throw Object.assign(new Error('Unexpected host'), { status: 403 });
      if (url.pathname === '/health') return json(response, 200, { service: 'mrmak', version: '0.6.0' });
      // An <img> cannot send the bearer token. Its unguessable, short-lived grant
      // is issued only through an authorized messages request for this chat.
      const media = /^\/media\/([a-f0-9-]{36})\/([a-zA-Z0-9_-]{43})$/.exec(url.pathname);
      if (media && ['GET', 'HEAD'].includes(request.method)) return await conversationMedia.serve(request, response, media[1], media[2], 'desktop', url.searchParams.get('download') === '1');
      if (url.pathname.startsWith('/api/')) {
        authorize(request);
        const method = request.method;
        if (method === 'POST' && url.pathname === '/api/files/import') {
          if (Number(request.headers['content-length']) > MAX_FILE_BYTES) throw Object.assign(new Error('Choose files of 1 GB or less.'), { status: 413 });
          const result = await importFile(request, url.searchParams.get('folder'), url.searchParams.get('name'));
          await integrations.publish('artifact', { kind: 'imported', ...result });
          broadcast('workspace-changed', {});
          return json(response, 201, result);
        }
        if (method === 'POST' && url.pathname === '/api/attachments') {
          const chunks = []; let length = 0;
          for await (const chunk of request) { length += chunk.length; if (length > MAX_IMAGE_BYTES) throw Object.assign(new Error('Choose an image smaller than 25 MB.'), { status: 413 }); chunks.push(chunk); }
          return json(response, 201, await attachments.save(Buffer.concat(chunks), decodeURIComponent(request.headers['x-file-name'] || 'Screenshot')));
        }
        const data = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) ? await body(request, url.pathname === '/api/files/markdown' ? 12 * 1024 * 1024 : 256 * 1024) : {};
        if (method === 'GET' && url.pathname === '/api/bootstrap') {
          return json(response, 200, { repo, contentBase: `${files.origin}/view/${files.repoGrant}`, agents: inventory(), sessions: sessions.list(), settings, selectedId, notices });
        }
        if (method === 'GET' && url.pathname === '/api/projects') {
          const matches = await projects.detect(url.searchParams.get('path') || repo);
          return json(response, 200, { matches, adapters: projects.adapters.map(item => ({ id: item.id, label: item.label })) });
        }
        if (method === 'GET' && url.pathname === '/api/projects/capabilities') {
          const matches = await projects.detect(url.searchParams.get('path') || repo);
          const selected = matches.find(item => item.adapterId === (url.searchParams.get('adapter') || matches[0]?.adapterId));
          return json(response, 200, selected ? await projects.capabilities(selected) : { matches: [] });
        }
        if (method === 'GET' && url.pathname === '/api/knowledge/providers') return json(response, 200, knowledge.list());
        if (method === 'GET' && url.pathname === '/api/knowledge/search') return json(response, 200, await knowledge.search(url.searchParams.get('q') || '', url.searchParams.get('provider')));
        if (method === 'GET' && url.pathname === '/api/knowledge/document') return json(response, 200, await knowledge.retrieve(url.searchParams.get('provider') || '', url.searchParams.get('ref') || '', url.searchParams.get('offset')));
        if (method === 'GET' && url.pathname === '/api/integrations') return json(response, 200, { providers: integrations.list(), bindings: integrations.bindings.map(({ providerId, externalId, workspaceId, boundAt }) => ({ providerId, externalId, workspaceId, boundAt })) });
        if (method === 'POST' && url.pathname === '/api/integrations/bind') return json(response, 200, await integrations.bind(data));
        if (method === 'GET' && url.pathname === '/api/native/settings') return json(response, 200, nativeSettings.value);
        if (method === 'GET' && url.pathname === '/api/mcp') return json(response, 200, await mcp.list());
        if (method === 'POST' && url.pathname === '/api/mcp/check') return json(response, 200, await mcp.check(data.id));
        if (method === 'POST' && url.pathname === '/api/native/settings') return json(response, 200, await nativeSettings.set(data.winKey));
        if (method === 'GET' && url.pathname === '/api/recent-projects') return json(response, 200, await projectList());
        if (method === 'POST' && url.pathname === '/api/recent-projects/pin') {
          const project = (await projectList()).find(item => typeof data.path === 'string' && projectKey(item.path) === projectKey(data.path));
          if (!project || typeof data.pinned !== 'boolean') throw new Error('Choose a project from the list.');
          const others = (settings.pinnedProjects || []).filter(item => projectKey(item) !== projectKey(project.path));
          settings.pinnedProjects = data.pinned ? [...others, project.path].slice(-30) : others;
          await saveSettings(); broadcast('settings', { settings });
          return json(response, 200, await projectList());
        }
        if (method === 'POST' && url.pathname === '/api/preview/show') {
          // A link in a chat may be relative to that chat's working folder.
          const base = typeof data.sessionId === 'string' ? sessions.get(data.sessionId).cwd : repo;
          if (typeof data.path !== 'string' || !data.path.trim() || /[\x00-\x1f]/.test(data.path)) throw new Error('Choose a local file or folder.');
          const target = await realpath(path.resolve(base, data.path));
          if ((await stat(target)).isDirectory()) { native({ type: 'reveal', path: target }); return json(response, 200, { shown: 'folder', path: target }); }
          const preview = await files.preview(target); show('workspace', { preview });
          return json(response, 200, { shown: 'preview', path: preview.path });
        }
        if (method === 'GET' && url.pathname === '/api/history') return json(response, 200, history(url.searchParams.get('q') || ''));
        if (method === 'POST' && url.pathname === '/api/history/import') return json(response, 201, await sessions.importConversation(data));
        if (method === 'GET' && url.pathname === '/api/files') return json(response, 200, await files.list(url.searchParams.get('path') || repo, url.searchParams.get('mode') || 'main', url.searchParams.get('q') || ''));
        if (method === 'POST' && url.pathname === '/api/files/pick') {
          if (typeof data.requestId !== 'string' || !/^[a-f\d-]{36}$/i.test(data.requestId)) throw new Error('Invalid file picker request.');
          native({ type: 'pick-files', window: 'chats', requestId: data.requestId });
          return json(response, 200, { requested: true });
        }
        if (method === 'POST' && url.pathname === '/api/files/drag') {
          const paths = await dragFiles(data.paths);
          native({ type: 'drag-files', window: 'workspace', paths });
          return json(response, 200, { requested: true });
        }
        if (method === 'POST' && url.pathname === '/api/files/move') {
          const result = await moveFile(data.path, data.folder);
          broadcast('workspace-changed', {});
          return json(response, 200, result);
        }
        if (method === 'POST' && url.pathname === '/api/files/recycle') {
          const file = await recyclePath(data.path, repo);
          native({ type: 'recycle-file', path: file });
          return json(response, 200, { requested: true, path: file });
        }
        if (method === 'GET' && url.pathname === '/api/preview') return json(response, 200, await files.preview(url.searchParams.get('path') || ''));
        if (method === 'POST' && url.pathname === '/api/files/markdown') {
          const preview = await files.saveMarkdown(data); await integrations.publish('artifact', { kind: 'updated', path: preview.path, name: preview.name }); broadcast('workspace-changed', {});
          return json(response, 200, preview);
        }
        if (method === 'POST' && url.pathname === '/api/settings') {
          if (inventory().some(item => item.id === data.defaultAgent)) settings.defaultAgent = data.defaultAgent;
          if (typeof data.defaultBypass === 'boolean') settings.defaultBypass = data.defaultBypass;
          if (Number.isInteger(data.terminalFontSize) && data.terminalFontSize >= 10 && data.terminalFontSize <= 24) settings.terminalFontSize = data.terminalFontSize;
          if (['focus', 'original'].includes(data.terminalAppearance)) settings.terminalAppearance = data.terminalAppearance;
          if (typeof data.terminalOptionMeta === 'boolean') settings.terminalOptionMeta = data.terminalOptionMeta;
          if (Number.isInteger(data.handoffAfter) && (data.handoffAfter === 0 || (data.handoffAfter >= 10 && data.handoffAfter <= 500))) settings.handoffAfter = data.handoffAfter;
          if (['full', 'compact', 'hidden'].includes(data.systemEvents)) settings.systemEvents = data.systemEvents;
          if (['dark', 'light', 'system'].includes(data.workspaceTheme)) settings.workspaceTheme = data.workspaceTheme;
          if (data.groupColors && typeof data.groupColors === 'object' && !Array.isArray(data.groupColors)) settings.groupColors = Object.fromEntries(Object.entries(data.groupColors).filter(([name, value]) => name.length <= 60 && typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)).slice(0, 200).map(([name, value]) => [name, value.toLowerCase()]));
          if (Array.isArray(data.collapsedGroups)) settings.collapsedGroups = [...new Set(data.collapsedGroups.filter(item => typeof item === 'string' && item.length <= 60))].slice(0, 200);
          await saveSettings(); broadcast('settings', { settings }); return json(response, 200, settings);
        }
        if (method === 'POST' && url.pathname === '/api/sessions') { const session = await sessions.create({ ...data, bypass: data.bypass ?? settings.defaultBypass }); await integrations.publish('session', { event: 'started', session }); focus(session.id); return json(response, 201, session); }
        if (method === 'POST' && url.pathname === '/api/groups/move') return json(response, 200, await sessions.moveGroup(data.group, data.pinned, data.targetId, data.position));
        if (method === 'POST' && url.pathname === '/api/groups/rename') {
          // A renamed group keeps its color and collapsed state; merging into an
          // existing group keeps that group's.
          const from = groupLabel(data.from), to = groupLabel(data.to);
          const merging = sessions.list().some(item => item.group === to);
          const result = await sessions.renameGroup(from, to);
          if (from !== to) {
            const { [from]: color, ...colors } = settings.groupColors || {};
            settings.groupColors = color && !merging ? { ...colors, [to]: color } : colors;
            const collapsed = settings.collapsedGroups || [];
            settings.collapsedGroups = [...new Set(collapsed.filter(item => item !== from).concat(collapsed.includes(from) && !merging ? [to] : []))];
            await saveSettings(); broadcast('settings', { settings });
          }
          return json(response, 200, result);
        }
        if (method === 'POST' && url.pathname === '/api/groups/delete') {
          // The group's color and collapsed state go with it; the chats stay.
          const name = groupLabel(data.name);
          const result = await sessions.deleteGroup(name);
          const colors = { ...(settings.groupColors || {}) }; delete colors[name];
          settings.groupColors = colors;
          settings.collapsedGroups = (settings.collapsedGroups || []).filter(item => item !== name);
          await saveSettings(); broadcast('settings', { settings });
          return json(response, 200, result);
        }
        const sessionRoute = /^\/api\/sessions\/([\w-]+)(?:\/(\w+))?$/.exec(url.pathname);
        if (sessionRoute) {
          const [, id, action] = sessionRoute;
          if (method === 'GET' && action === 'screen') return json(response, 200, await sessions.read(id));
          if (method === 'GET' && action === 'messages') {
            const session = sessions.get(id);
            const value = await conversationMedia.present(await transcripts.read(session), session, 'desktop', grant => `/media/${session.id}/${grant}`);
            return json(response, 200, { ...value, prompt: session.process ? await readPrompt(sessions, id) : null });
          }
          if (method === 'GET' && action === 'commands') { const session = sessions.get(id); return json(response, 200, await chatCommands(session.agent, session.cwd, mcpOptions)); }
          if (method === 'GET' && action === 'stats') {
            const { supported, userMessages = 0, truncated = false, model = null } = await transcripts.read(sessions.get(id));
            return json(response, 200, { supported, userMessages, truncated, model, handoff: handoffs.state(id) });
          }
          if (method === 'POST' && action === 'handoff') return json(response, 200, handoffs.start(id));
          if (method === 'POST' && action === 'prompt') return json(response, 200, await answerPrompt(sessions, id, data.id, data.choice));
          if (method === 'POST' && action === 'rewind') return json(response, 200, await rewindToMessage(sessions, transcripts, id, String(data.messageId || '')));
          if (method === 'POST' && action === 'send') {
            // One prompt: the text and any attached paths are pasted together, then submitted.
            const session = sessions.get(id), text = typeof data.text === 'string' ? data.text : '';
            const paths = Array.isArray(data.paths) && data.paths.length ? await attachments.paths(data.paths) : [];
            if (!text.trim() && !paths.length) throw new Error('Write a message or attach a file.');
            return json(response, 200, sessions.input(id, `${text}${paths.length ? `${text ? '\n' : ''}${attachmentText(paths, session.agent)}` : ''}`, { coordinator: true, submit: true }));
          }
          if (method === 'POST' && action === 'focus') return json(response, 200, focus(id));
          if (method === 'POST' && action === 'stop') return json(response, 200, sessions.stop(id));
          if (method === 'POST' && action === 'resume') { const session = await sessions.resume(id, data.nativeId); focus(id); return json(response, 200, session); }
          if (method === 'POST' && action === 'attach') return json(response, 200, await attach(id, data.paths));
          if (method === 'POST' && action === 'clear') return json(response, 200, await sessions.clearScreen(id));
          if (method === 'POST' && action === 'reorder') return json(response, 200, await sessions.reorder(id, data.targetId, data.position));
          if (method === 'POST' && action === 'input') return json(response, 200, sessions.input(id, data.text, { coordinator: data.paste !== false, submit: data.submit !== false }));
          if (method === 'PATCH' && !action) return json(response, 200, typeof data.pinned === 'boolean' ? sessions.pin(id, data.pinned) : 'tabColor' in data ? sessions.color(id, data.tabColor) : 'group' in data ? await sessions.assign(id, data.group) : sessions.rename(id, data.name));
          if (method === 'DELETE' && !action) return json(response, 200, await closeChat(id));
        }
        if (method === 'POST' && url.pathname === '/api/window') {
          if (!['chats', 'workspace'].includes(data.window) || !['show', 'hide', 'minimize', 'pin'].includes(data.action)) throw new Error('Unknown window action');
          native({ type: 'window', action: data.action, window: data.window, value: !!data.value }); return json(response, 200, { requested: true });
        }
        if (method === 'POST' && url.pathname === '/api/reveal') {
          const file = await realpath(path.resolve(data.path));
          native({ type: 'reveal', path: file }); return json(response, 200, { requested: true });
        }
        throw Object.assign(new Error('Endpoint not found'), { status: 404 });
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw Object.assign(new Error('Not allowed'), { status: 405 });
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const { file, info } = await realFile(uiDir, relative);
      if (!info.isFile()) throw new Error('File not found');
      await serveFile(request, response, file, info, {
        'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: ${files.origin}; media-src 'self' blob: ${files.origin}; connect-src 'self' ws://127.0.0.1:* ${files.origin}; frame-src ${files.origin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`,
      });
    } catch (error) { if (!response.headersSent) json(response, error.status || 400, { error: publicError(error) }); }
  });
  const origin = await listen(server);
  files.uiOrigin = origin;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, origin);
    if (request.headers.host !== new URL(origin).host || request.headers.origin !== origin || url.pathname !== '/events') { socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    ws.authenticated = false; ws.sessionId = null;
    const authTimer = setTimeout(() => ws.close(1008, 'Authentication required'), 5000);
    ws.on('message', async raw => {
      try {
        const message = JSON.parse(raw.toString());
        if (!ws.authenticated) {
          if (message.type !== 'auth' || !equalSecret(message.token, token)) return ws.close(1008, 'Authentication failed');
          ws.authenticated = true; ws.clientId = message.clientId; ws.surface = message.surface; clients.add(ws); clearTimeout(authTimer);
          send(ws, 'connected', { sessions: sessions.list(), selectedId }); return;
        }
        if (message.type === 'subscribe') {
          ws.sessionId = message.id;
          const snapshot = await sessions.snapshot(message.id);
          if (ws.sessionId === message.id) send(ws, 'snapshot', snapshot);
        } else if (message.type === 'input') sessions.input(message.id, message.data);
        else if (message.type === 'resize') sessions.resize(message.id, message.cols, message.rows);
        else if (message.type === 'selected') { sessions.get(message.id); selectedId = message.id; settings.selectedId = selectedId; scheduleSettings(); }
        else if (message.type === 'seen' && ws.surface === 'chats' && ws.sessionId === message.id && selectedId === message.id) sessions.seen(message.id, message.completionVersion);
        else if (message.type === 'ping') send(ws, 'pong', {});
      } catch (error) { send(ws, 'service-error', { error: publicError(error) }); }
    });
    ws.on('close', () => { clearTimeout(authTimer); clients.delete(ws); });
    ws.on('error', () => {});
  });
  const restoreTimer = restoreSessions ? setTimeout(() => sessions.restore().catch(error => sessions.emit('service-error', error)), 100) : null;
  return {
    origin, contentOrigin: files.origin, token, sessions, transcripts, files, projects, knowledge, integrations,
    urls: { workspace: `${origin}/?desktop=1&surface=workspace&token=${token}`, chats: `${origin}/?desktop=1&surface=chats&token=${token}` },
      nativeMessage: event => nativeSettings.receive(event),
      async close() {
        if (closing) return; closing = true; mcp.close(); nativeSettings.close(); await files.writes.catch(() => {});
      clearTimeout(restoreTimer); clearTimeout(settingsTimer); await saveSettings();
      for (const ws of wss.clients) ws.terminate();
      wss.close(); await sessions.close();
      server.closeAllConnections(); contentServer.closeAllConnections();
      await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => contentServer.close(resolve))]);
    },
  };
}
