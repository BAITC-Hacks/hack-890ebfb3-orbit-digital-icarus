"""Bootstrap checks use fakes for installs; they never access package registries."""

import os
from pathlib import Path
import subprocess
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

import start


@pytest.mark.parametrize("version,expected", [
    ("v22.12.0", True), ("v22.11.0", False), ("v24.15.0", True),
    ("v26.0.0", True), ("v28.0.0", True), ("v20.19.0", False),
    ("v23.1.0", False), ("v25.0.0", False), ("", False), ("invalid", False),
])
def test_supported_node_matches_project_engines(version, expected):
    assert start.supported_node(version) is expected


def test_missing_node_has_download_instructions(monkeypatch):
    monkeypatch.setattr(start.shutil, "which", lambda _: None)
    with pytest.raises(start.LaunchError, match="https://nodejs.org/en/download"):
        start.find_node()


def test_old_node_has_upgrade_instructions(monkeypatch):
    monkeypatch.setattr(start.shutil, "which", lambda name: name)
    monkeypatch.setattr(start.subprocess, "run", lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout="v20.19.0"))
    with pytest.raises(start.LaunchError, match="unsupported"):
        start.find_node()


@pytest.fixture
def bootstrap(tmp_path, monkeypatch):
    # Spaces in paths and unrelated caller directories must not change path handling.
    root = tmp_path / "Orbit clone with spaces"
    root.mkdir()
    cache = root / ".orbit"
    environment = cache / "venv"
    monkeypatch.setattr(start, "ROOT", root)
    monkeypatch.setattr(start, "CACHE", cache)
    monkeypatch.setattr(start, "ENVIRONMENT", environment)
    monkeypatch.setattr(start, "find_node", lambda: ("npm.cmd" if os.name == "nt" else "npm", "v24.15.0"))
    monkeypatch.chdir(tmp_path)
    frontend = root / "frontend"
    (frontend / "src").mkdir(parents=True)
    (root / "requirements-dev.lock").write_text("test==1.0", encoding="utf-8")
    (frontend / "package.json").write_text("{}", encoding="utf-8")
    (frontend / "package-lock.json").write_text("{}", encoding="utf-8")
    (frontend / "src" / "App.tsx").write_text("initial source", encoding="utf-8")
    python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    calls = []

    def step(command, description, env=None):
        calls.append((command, env))
        if "venv" in command:
            python.parent.mkdir(parents=True, exist_ok=True)
            python.touch()
        elif "ci" in command:
            vite = frontend / "node_modules" / "vite"
            vite.mkdir(parents=True, exist_ok=True)
            (vite / "package.json").write_text("{}", encoding="utf-8")
        elif "build" in command:
            dist = frontend / "dist"
            dist.mkdir(exist_ok=True)
            (dist / "index.html").write_text("built", encoding="utf-8")

    monkeypatch.setattr(start, "run_step", step)
    return SimpleNamespace(root=root, cache=cache, python=python, frontend=frontend, calls=calls)


def test_first_setup_installs_locked_dependencies_and_forces_real_api(bootstrap, monkeypatch):
    monkeypatch.setenv("VITE_API_MODE", "demo")
    assert start.setup() == bootstrap.python
    commands = [command for command, _ in bootstrap.calls]
    assert len(commands) == 5  # venv, pip install, pip check, npm ci, production build
    assert str(bootstrap.root / "requirements-dev.lock") in commands[1]
    assert commands[2][-1] == "check"
    assert "ci" in commands[3]
    assert str(bootstrap.frontend) in commands[3]
    assert bootstrap.calls[-1][1]["VITE_API_MODE"] == "api"
    assert all((bootstrap.cache / name).exists() for name in ["python.ready", "node.ready", "build.ready"])


def test_unchanged_setup_reuses_cache_without_install_or_build(bootstrap):
    start.setup()
    bootstrap.calls.clear()
    assert start.setup() == bootstrap.python
    assert bootstrap.calls == []


def test_changed_source_rebuilds_without_reinstalling(bootstrap):
    start.setup()
    bootstrap.calls.clear()
    (bootstrap.frontend / "src" / "App.tsx").write_text("changed source", encoding="utf-8")
    start.setup()
    assert len(bootstrap.calls) == 1
    assert bootstrap.calls[0][0][-2:] == ["run", "build"]


def test_changed_lock_reinstalls_python(bootstrap):
    start.setup()
    bootstrap.calls.clear()
    (bootstrap.root / "requirements-dev.lock").write_text("test==2.0", encoding="utf-8")
    start.setup()
    assert len(bootstrap.calls) == 2
    assert "install" in bootstrap.calls[0][0]
    assert bootstrap.calls[1][0][-1] == "check"


def test_missing_python_recreates_and_reinstalls_despite_old_stamp(bootstrap):
    start.setup()
    bootstrap.calls.clear()
    bootstrap.python.unlink()
    start.setup()
    assert len(bootstrap.calls) == 3
    assert "venv" in bootstrap.calls[0][0]
    assert "install" in bootstrap.calls[1][0]


def test_missing_frontend_build_is_recreated(bootstrap):
    start.setup()
    bootstrap.calls.clear()
    (bootstrap.frontend / "dist" / "index.html").unlink()
    start.setup()
    assert len(bootstrap.calls) == 1
    assert "build" in bootstrap.calls[0][0]


def test_failed_install_does_not_save_success_stamp(bootstrap, monkeypatch):
    original_step = start.run_step

    def fail_pip(command, description, env=None):
        if "install" in command:
            raise start.LaunchError("offline")
        original_step(command, description, env)

    monkeypatch.setattr(start, "run_step", fail_pip)
    with pytest.raises(start.LaunchError, match="offline"):
        start.setup()
    assert not (bootstrap.cache / "python.ready").exists()


def test_setup_failure_returns_help_without_traceback(monkeypatch, capsys):
    monkeypatch.setattr(start, "setup", Mock(side_effect=start.LaunchError("install Node")))
    assert start.main([]) == 1
    output = capsys.readouterr().out
    assert "install Node" in output and "Troubleshooting" in output
    assert "Traceback" not in output


def test_prepare_only_does_not_start_browser_or_server(monkeypatch):
    setup = Mock(return_value=Path("private python"))
    wait = Mock()
    monkeypatch.setattr(start, "setup", setup)
    monkeypatch.setattr(start, "wait_for_server", wait)
    assert start.main(["--prepare-only"]) == 0
    setup.assert_called_once()
    wait.assert_not_called()


def test_launcher_passes_options_as_arguments_not_shell_text(monkeypatch):
    monkeypatch.setattr(start, "setup", lambda: Path("private python"))
    wait = Mock(return_value=0)
    monkeypatch.setattr(start, "wait_for_server", wait)
    assert start.main(["--no-browser", "--port", "8790"]) == 0
    wait.assert_called_once_with(["private python", str(start.ROOT / "start.py"), "--serve", "--no-browser", "--port", "8790"])


def test_busy_default_port_falls_forward_without_stopping_owner(monkeypatch):
    with start.reserve_port(0) as occupied:
        port = occupied.getsockname()[1]
        monkeypatch.setattr(start, "DEFAULT_PORT", port)
        with start.reserve_port(None) as available:
            assert port < available.getsockname()[1] < port + 20
        with pytest.raises(start.LaunchError, match="No existing service was stopped"):
            start.reserve_port(port)
        occupied.listen()  # The original socket remains usable.


def test_keyboard_interrupt_terminates_only_owned_child_if_needed(monkeypatch):
    child = Mock()
    child.wait.side_effect = [KeyboardInterrupt(), subprocess.TimeoutExpired("server", 5), 0]
    popen = Mock(return_value=child)
    monkeypatch.setattr(start.subprocess, "Popen", popen)
    assert start.wait_for_server(["private-python", "--serve"]) == 0
    child.terminate.assert_called_once()
    popen.assert_called_once_with(["private-python", "--serve"], cwd=start.ROOT)
