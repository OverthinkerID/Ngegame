#!/bin/bash
set -e
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# Prioritaskan venv eksternal VoiceCloneProject jika tersedia
if [ -f "$HOME/VoiceCloneProject/voice-en/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "$HOME/VoiceCloneProject/voice-en/bin/activate"
elif [ -f "$HOME/VoiceCloneProject/voice-env/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "$HOME/VoiceCloneProject/voice-env/bin/activate"
elif [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/miniconda3/etc/profile.d/conda.sh"
  conda activate base || true
elif [ -f "$HOME/anaconda3/etc/profile.d/conda.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/anaconda3/etc/profile.d/conda.sh"
  conda activate base || true
fi

echo "Menjalankan Overthinker-Ngegame (Backend + Renderer + Desktop + Voice Server)..."
npm run dev:all
