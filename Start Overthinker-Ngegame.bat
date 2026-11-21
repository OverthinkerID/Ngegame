@echo off
cd /d "%~dp0"
if exist "%USERPROFILE%\VoiceCloneProject\voice-en\Scripts\activate.bat" (
  call "%USERPROFILE%\VoiceCloneProject\voice-en\Scripts\activate.bat"
) else if exist "%USERPROFILE%\VoiceCloneProject\voice-env\Scripts\activate.bat" (
  call "%USERPROFILE%\VoiceCloneProject\voice-env\Scripts\activate.bat"
)
echo Menjalankan Overthinker-Ngegame (Backend + Renderer + Desktop + Voice Server)...
npm run dev:all
pause
