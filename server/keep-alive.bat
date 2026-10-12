@echo off
cd /d C:\Users\mathy\crm-eprotectoit\server
:loop
"C:\Program Files\nodejs\node.exe" server.js
timeout /t 3 /nobreak > nul
goto loop
