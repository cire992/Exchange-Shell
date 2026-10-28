// Exchange's Open in app: an asset's file opens with its Windows app, as a double-click in Explorer
// would. It runs here, outside the service's process job, so the app stays open when the shell
// closes. The service checks the file first (desktop/service/exchange/open-file.mjs); a folder, or
// a file that would run code instead of opening in an app, is refused here too.
use std::path::Path;

const RUNNABLE: [&str; 34] = ["exe", "com", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh",
    "msc", "msi", "msp", "scr", "pif", "cpl", "hta", "jar", "reg", "lnk", "url", "appref-ms", "application",
    "gadget", "inf", "scf", "sct", "settingcontent-ms", "appx", "msix", "library-ms", "search-ms"];

fn openable(target: &Path) -> Result<(), String> {
    if !target.is_file() { return Err(format!("{} is not a file on disk.", target.display())); }
    let extension = target.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if RUNNABLE.contains(&extension.as_str()) {
        return Err(format!("{} is a program or a shortcut; Exchange doesn't run those.", target.display()));
    }
    Ok(())
}

pub fn open_file(path: &str) {
    let path = path.to_owned();
    std::thread::spawn(move || {
        if let Err(error) = open(Path::new(&path)) {
            rfd::MessageDialog::new().set_title("Could not open the file").set_description(error).set_level(rfd::MessageLevel::Error).show();
        }
    });
}

#[cfg(windows)]
fn open(target: &Path) -> Result<(), String> {
    use windows_sys::Win32::{System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED}, UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL}};
    openable(target)?;
    let verb: Vec<u16> = "open\0".encode_utf16().collect();
    let file: Vec<u16> = target.as_os_str().to_string_lossy().encode_utf16().chain(Some(0)).collect();
    unsafe {
        let initialized = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
        let result = ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(), std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL) as isize;
        if initialized >= 0 { CoUninitialize(); }
        if result > 32 { Ok(()) } else { Err(format!("Windows could not open {} (code {result}). Is an app set to open this kind of file?", target.display())) }
    }
}

#[cfg(not(windows))]
fn open(target: &Path) -> Result<(), String> {
    openable(target)?;
    let program = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    let mut child = std::process::Command::new(program).arg(target).spawn().map_err(|error| format!("Could not start {program}: {error}"))?;
    std::thread::spawn(move || { let _ = child.wait(); });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_files_but_not_folders_programs_or_shortcuts() {
        let root = std::env::temp_dir().join(format!("exchange-open-test-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        for name in ["Helmet.glb", "Notes.TXT", "setup.EXE", "Daz.lnk", "run.bat"] { std::fs::write(root.join(name), "").unwrap(); }
        assert!(openable(&root.join("Helmet.glb")).is_ok());
        assert!(openable(&root.join("Notes.TXT")).is_ok());
        for refused in ["setup.EXE", "Daz.lnk", "run.bat", "missing.glb"] { assert!(openable(&root.join(refused)).is_err(), "{refused}"); }
        assert!(openable(&root).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
