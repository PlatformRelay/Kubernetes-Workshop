#!/usr/bin/env bash
# Shared, side-effect-free host checks used by bootstrap.sh and doctor.sh.
# Keep these functions compatible with the Bash 3 shipped by older macOS hosts.

workshop_detect_os() {
  local uname_s kernel_release kernel_release_lower has_wsl_hint=0
  uname_s="$(uname -s 2>/dev/null || echo unknown)"

  case "$uname_s" in
    Darwin) echo "macos" ;;
    Linux)
      kernel_release="$(uname -r 2>/dev/null || echo unknown)"
      kernel_release_lower="$(printf '%s' "$kernel_release" | tr '[:upper:]' '[:lower:]')"
      if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ] ||
        grep -qiE '(microsoft|wsl)' /proc/version 2>/dev/null; then
        has_wsl_hint=1
      fi

      # WSL2 runs Microsoft's real Linux kernel. Modern releases carry
      # microsoft-standard/WSL2 in uname -r; WSL1's translation layer reports
      # a Microsoft kernel without that WSL2 evidence. Environment variables
      # alone are deliberately insufficient: ambiguous WSL fails closed as 1.
      case "$kernel_release_lower" in
        *microsoft-standard* | *wsl2*) echo "wsl2" ;;
        *microsoft* | *wsl*) echo "wsl1" ;;
        *)
          if [ "$has_wsl_hint" -eq 1 ]; then
            echo "wsl1"
          else
            echo "linux"
          fi
          ;;
      esac
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

workshop_lf_files() {
  printf '%s\n' workshop infra/bootstrap.sh infra/doctor.sh \
    infra/platform-checks.sh infra/versions.env
}

workshop_executable_files() {
  printf '%s\n' workshop infra/bootstrap.sh infra/doctor.sh
}

workshop_crlf_files() {
  local repo_root="$1" relative_path file_path
  workshop_lf_files | while IFS= read -r relative_path; do
    file_path="$repo_root/$relative_path"
    [ -f "$file_path" ] || continue
    if LC_ALL=C grep -q "$(printf '\r')" "$file_path" 2>/dev/null; then
      printf '%s\n' "$relative_path"
    fi
  done
}

workshop_nonexecutable_files() {
  local repo_root="$1" relative_path file_path
  workshop_executable_files | while IFS= read -r relative_path; do
    file_path="$repo_root/$relative_path"
    [ -f "$file_path" ] || continue
    [ -x "$file_path" ] || printf '%s\n' "$relative_path"
  done
}
