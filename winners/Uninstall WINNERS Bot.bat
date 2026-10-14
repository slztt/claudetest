@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\WINNERS Bot.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\WINNERS Bot Setup and Repair.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\WINNERS Bot Update.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WINNERS Bot.lnk" 2>nul
del "%USERPROFILE%\Desktop\WINNERS Bot.lnk" 2>nul
echo WINNERS Bot shortcuts removed. Delete this folder to remove the program, and %USERPROFILE%\.winnersbot to remove your data.
pause
