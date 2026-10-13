@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\JARVIS.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\JARVIS Setup and Repair.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\JARVIS Update.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\JARVIS.lnk" 2>nul
del "%USERPROFILE%\Desktop\JARVIS.lnk" 2>nul
echo JARVIS shortcuts removed. Delete this folder to remove the program, and %USERPROFILE%\.jarvis to remove your data.
echo The local AI engine (Ollama) and its models can be removed from Windows Settings ^> Apps.
pause
