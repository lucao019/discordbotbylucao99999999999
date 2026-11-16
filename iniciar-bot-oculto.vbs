' Starts CheckIn with no visible window (auto-restarts via iniciar-bot.bat).
' Console output goes to logs\console.log. To stop it, run parar-bot.bat.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
If Not fso.FolderExists(dir & "\logs") Then fso.CreateFolder(dir & "\logs")
shell.CurrentDirectory = dir
shell.Run "cmd /c """"" & dir & "\iniciar-bot.bat"" >> """ & dir & "\logs\console.log"" 2>&1""", 0, False
