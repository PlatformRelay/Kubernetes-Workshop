#!/usr/bin/env bash
# Shared, side-effect-free host checks used by bootstrap.sh and doctor.sh.
# Keep these functions compatible with the Bash 3 shipped by older macOS hosts.

workshop_detect_os() {
  local uname_s
  uname_s="$(uname -s 2>/dev/null || echo unknown)"

  # WSL exposes these variables to Linux processes. Check them before uname so
  # tests and unusual WSL kernels do not depend on a particular kernel string.
  if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
    echo "wsl2"
    return 0
  fi

  case "$uname_s" in
    Darwin) echo "macos" ;;
    Linux)
      if grep -qiE '(microsoft|wsl)' /proc/version 2>/dev/null; then
        echo "wsl2"
      else
        echo "linux"
      fi
      ;;
    MINGW* | MSYS* | CYGWIN*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
}

workshop_repo_is_windows_mount() {
  local os="$1" repo_root="$2"
  [ "$os" = "wsl2" ] || return 1
  case "$repo_root" in
    /mnt/[a-zA-Z] | /mnt/[a-zA-Z]/*) return 0 ;;
    *) return 1 ;;
  esac
}

workshop_script_files() {
  printf '%s\n' workshop infra/bootstrap.sh infra/doctor.sh
}

workshop_crlf_files() {
  local repo_root="$1" relative_path file_path
  workshop_script_files | while IFS= read -r relative_path; do
    file_path="$repo_root/$relative_path"
    [ -f "$file_path" ] || continue
    if LC_ALL=C grep -q "$(printf '\r')" "$file_path" 2>/dev/null; then
      printf '%s\n' "$relative_path"
    fi
  done
}

workshop_nonexecutable_files() {
  local repo_root="$1" relative_path file_path
  workshop_script_files | while IFS= read -r relative_path; do
    file_path="$repo_root/$relative_path"
    [ -f "$file_path" ] || continue
    [ -x "$file_path" ] || printf '%s\n' "$relative_path"
  done
}
