#!/usr/bin/env python3
"""One command: install locally, build the real interface, open the application.

Only the standard library is imported before the private environment is ready.
No global packages, administrator access, API keys or separate terminals needed.
"""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser


ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".orbit"
ENVIRONMENT = CACHE / "venv"
DEFAULT_PORT = 8765


class LaunchError(Exception):
    """A recoverable setup issue with instructions suitable for a first-time user."""


def say(message: str) -> None:
    print(message, flush=True)


def fingerprint(paths: list[Path], extra: str = "") -> str:
    """Content, not timestamps: pulling changed code or locks invalidates the cache."""
    digest = hashlib.sha256(extra.encode())
    for path in sorted(paths):
        digest.update(str(path.relative_to(ROOT)).encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def current_stamp(name: str, expected: str) -> bool:
    try:
        return (CACHE / name).read_text(encoding="utf-8") == expected
    except OSError:
        return False


def save_stamp(name: str, value: str) -> None:
    # Write only after success so an interrupted installation is retried next time.
    temporary = CACHE / f"{name}.tmp"
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(CACHE / name)


def run_step(command: list[str], description: str, env: dict[str, str] | None = None) -> None:
    """Keep setup output in a local log, but show actionable errors in the launch window."""
    say(description)
    log_path = CACHE / "setup.log"
    with log_path.open("a", encoding="utf-8") as log:
        log.write(f"\n--- {description} ---\n")
        log.flush()
        result = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        tail = "\n".join(log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-12:])
        raise LaunchError(
            f"This step could not finish. Check your internet connection and try launching again.\n"
            f"Details are saved in {log_path}\n\n{tail}"
        )


def supported_node(version: str) -> bool:
    """Match the engines range committed in package.json, not an unpinned latest release."""
    try:
        major, minor, *_ = [int(part) for part in version.strip().lstrip("v").split(".")]
        return (major == 22 and minor >= 12) or major == 24 or major >= 26
    except ValueError:
        return False


def find_node() -> tuple[str, str]:
    node = shutil.which("node")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not node or not npm:
        raise LaunchError("Install Node.js 24 LTS from https://nodejs.org/en/download, then reopen this window and launch again.")
    version = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=10)
    if version.returncode or not supported_node(version.stdout):
        raise LaunchError("This Node.js version is unsupported. Install Node.js 24 LTS from https://nodejs.org/en/download and launch again.")
    return npm, version.stdout.strip()


def setup() -> Path:
    if sys.version_info < (3, 11):
        raise LaunchError("Install Python 3.11 or newer from https://www.python.org/downloads/ and launch again.")
    # Validate prerequisites before installing anything; never modify a user's .venv.
    npm, node_version = find_node()
    CACHE.mkdir(exist_ok=True)
    python = ENVIRONMENT / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    new_environment = not python.is_file()
    if new_environment:
        run_step([sys.executable, "-m", "venv", str(ENVIRONMENT)], "[1/3] Preparing Orbit's private Python environment...")
    python_key = fingerprint([ROOT / "requirements-dev.lock"], f"{sys.version}|{platform.platform()}|{sys.executable}")
    if new_environment or not current_stamp("python.ready", python_key):
        run_step([str(python), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(ROOT / "requirements-dev.lock")], "[1/3] Installing app dependencies. First launch can take a few minutes...")
        run_step([str(python), "-m", "pip", "check"], "[1/3] Checking installed dependencies...")
        save_stamp("python.ready", python_key)
    else:
        say("[1/3] App dependencies are ready.")
    frontend = ROOT / "frontend"
    node_key = fingerprint([frontend / "package.json", frontend / "package-lock.json"], node_version)
    if not current_stamp("node.ready", node_key) or not (frontend / "node_modules" / "vite" / "package.json").is_file():
        run_step([npm, "--prefix", str(frontend), "ci", "--include=dev", "--no-fund"], "[2/3] Installing website dependencies...")
        save_stamp("node.ready", node_key)
    else:
        say("[2/3] Website dependencies are ready.")
    sources = [path for folder in (frontend / "src", frontend / "public") if folder.is_dir() for path in folder.rglob("*") if path.is_file()]
    sources += [path for path in frontend.iterdir() if path.is_file() and (path.suffix in {".json", ".html", ".ts"} or path.name.startswith(".env"))]
    build_key = fingerprint(sources, node_key + "|api|launcher-v1")
    if not current_stamp("build.ready", build_key) or not (frontend / "dist" / "index.html").is_file():
        # Never allow a developer's preview setting to become the judge's demonstration.
        environment = dict(os.environ, VITE_API_MODE="api")
        run_step([npm, "--prefix", str(frontend), "run", "build"], "[3/3] Building the website...", environment)
        save_stamp("build.ready", build_key)
    else:
        say("[3/3] Website build is ready.")
    return python


def reserve_port(requested: int | None) -> socket.socket:
    """Keep the socket bound until Uvicorn takes it; never stop an unrelated service."""
    ports = [requested] if requested is not None else range(DEFAULT_PORT, DEFAULT_PORT + 20)
    for port in ports:
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if os.name == "nt":
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            listener.bind(("127.0.0.1", port))
            return listener
        except OSError:
            listener.close()
    raise LaunchError("That local port is busy. Close your other Orbit window or run python start.py --port 8790. No existing service was stopped.")


def announce_when_ready(server, url: str, open_browser: bool) -> None:
    """Do not open a broken page while the catalog is still being validated."""
    deadline = time.monotonic() + 60
    while not server.started:
        if server.should_exit or time.monotonic() > deadline:
            return
        time.sleep(0.1)
    say(f"\nOrbit is ready! Open {url}\nKeep this window open. Press Ctrl+C to stop.\n")
    if open_browser:
        try:
            if not webbrowser.open(url):
                say("Your browser did not open automatically. Copy the address above into it.")
        except (webbrowser.Error, OSError):
            say("Open the address above in your browser.")


def serve(port: int | None, open_browser: bool) -> None:
    # These imports run only in the managed environment, after successful setup.
    import uvicorn
    from backend.app.web import create_web_app

    with reserve_port(port) as listener:
        actual_port = listener.getsockname()[1]
        config = uvicorn.Config(create_web_app(), host="127.0.0.1", port=actual_port, log_level="warning", access_log=False)
        server = uvicorn.Server(config)
        threading.Thread(target=announce_when_ready, args=(server, f"http://127.0.0.1:{actual_port}", open_browser), daemon=True).start()
        server.run(sockets=[listener])
        if not server.started:
            raise LaunchError("Orbit could not start. See the message above; the supplied catalog and evidence must be intact.")


def wait_for_server(command: list[str]) -> int:
    child = subprocess.Popen(command, cwd=ROOT)
    try:
        return child.wait()
    except KeyboardInterrupt:
        say("\nStopping Orbit...")
        # Ctrl+C reaches the child in the same console; allow its graceful shutdown first.
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.terminate()  # Only our own child process, never a port owner's process.
            child.wait(timeout=5)
        return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Start Orbit. Installs dependencies, builds the website and opens your browser.")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser (useful for automated checks).")
    parser.add_argument("--port", type=int, help="Use a specific local port instead of choosing an available one.")
    parser.add_argument("--prepare-only", action="store_true", help="Install and build without starting the app.")
    parser.add_argument("--serve", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.port is not None and not 1 <= args.port <= 65535:
        parser.error("Port must be a number from 1 to 65535.")
    try:
        if args.serve:
            serve(args.port, not args.no_browser)
            return 0
        say("\nORBIT - Event contractor matching\nFirst launch needs internet. Later launches reuse the installation.\n")
        python = setup()
        if args.prepare_only:
            say("\nSetup complete. Launch Orbit again whenever you are ready.")
            return 0
        command = [str(python), str(ROOT / "start.py"), "--serve"]
        if args.no_browser:
            command.append("--no-browser")
        if args.port is not None:
            command.extend(["--port", str(args.port)])
        return wait_for_server(command)
    except KeyboardInterrupt:
        say("\nStopped. Run the launcher again when you are ready.")
        return 0
    except (LaunchError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        say(f"\nOrbit could not launch:\n{error}\n\nNeed help? Open README.md, section 'Troubleshooting'.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
