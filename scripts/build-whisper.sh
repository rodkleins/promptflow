#!/usr/bin/env bash
# Build whisper.cpp for the current host and place the binary where Tauri's
# `externalBin` resolver expects it: src-tauri/sidecars/whisper/whisper-<triple>.
#
# Usage: scripts/build-whisper.sh [--rebuild]
#   --rebuild   wipe the existing whisper.cpp checkout and rebuild from scratch

set -euo pipefail

WHISPER_REPO="https://github.com/ggerganov/whisper.cpp.git"
WHISPER_REF="v1.7.4"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIDECAR_DIR="${REPO_ROOT}/src-tauri/sidecars/whisper"
SRC_DIR="${SIDECAR_DIR}/whisper.cpp"

mkdir -p "${SIDECAR_DIR}"

if [[ "${1:-}" == "--rebuild" ]]; then
  echo "[build-whisper] --rebuild: removing ${SRC_DIR}"
  rm -rf "${SRC_DIR}"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "[build-whisper] rustc not found — install Rust via https://rustup.rs/ first" >&2
  exit 1
fi

TRIPLE="$(rustc -vV | awk '/^host:/ {print $2}')"
if [[ -z "${TRIPLE}" ]]; then
  echo "[build-whisper] could not detect host target triple" >&2
  exit 1
fi
echo "[build-whisper] host triple: ${TRIPLE}"

case "${TRIPLE}" in
  *-pc-windows-*) BIN_EXT=".exe" ;;
  *) BIN_EXT="" ;;
esac
OUT_BIN="${SIDECAR_DIR}/whisper-${TRIPLE}${BIN_EXT}"

if [[ ! -d "${SRC_DIR}" ]]; then
  echo "[build-whisper] cloning whisper.cpp ${WHISPER_REF}"
  git clone --depth 1 --branch "${WHISPER_REF}" "${WHISPER_REPO}" "${SRC_DIR}"
fi

BUILD_DIR="${SRC_DIR}/build"
echo "[build-whisper] configuring (cmake)"
cmake -S "${SRC_DIR}" -B "${BUILD_DIR}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON

echo "[build-whisper] building whisper-cli"
cmake --build "${BUILD_DIR}" --config Release --target whisper-cli -j

# whisper.cpp >= 1.7 emits the CLI at build/bin/whisper-cli.
# Earlier versions used `main`; fall back to that if needed.
SRC_BIN=""
for candidate in \
  "${BUILD_DIR}/bin/whisper-cli${BIN_EXT}" \
  "${BUILD_DIR}/bin/Release/whisper-cli${BIN_EXT}" \
  "${BUILD_DIR}/bin/main${BIN_EXT}" \
  "${BUILD_DIR}/bin/Release/main${BIN_EXT}"
do
  if [[ -f "${candidate}" ]]; then
    SRC_BIN="${candidate}"
    break
  fi
done

if [[ -z "${SRC_BIN}" ]]; then
  echo "[build-whisper] built artifact not found under ${BUILD_DIR}/bin" >&2
  exit 1
fi

cp "${SRC_BIN}" "${OUT_BIN}"
chmod +x "${OUT_BIN}"
echo "[build-whisper] installed ${OUT_BIN}"
