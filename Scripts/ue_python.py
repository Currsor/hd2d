#!/usr/bin/env python3
"""
UE Python Remote Execution — send Python code to a running UE Editor via Remote Execution protocol.

Usage:
    UE_ENGINE_ROOT="<Engine/" python ue_python.py "import unreal; print('hello')"
    UE_ENGINE_ROOT="<Engine/" python ue_python.py "import unreal; print('hello')" 15  # custom timeout

Exit codes:
    0 = success (stdout returned)
    1 = Python execution error (traceback returned)
    2 = connection failure (Editor not running, Remote Execution disabled, or timeout)
"""

import json
import socket
import struct
import sys
import time
import os

# ── UDP Discovery ──────────────────────────────────────────────
MULTICAST_GROUP = "239.0.0.1"
MULTICAST_PORT = 6766
DISCOVERY_TIMEOUT = 2.0


def _find_remote_execution(engine_root: str) -> str | None:
    """Locate remote_execution.py shipped with UE's PythonScriptPlugin."""
    candidates = [
        os.path.join(engine_root, "Plugins", "Experimental", "PythonScriptPlugin", "Content", "Python", "remote_execution.py"),
        os.path.join(engine_root, "Plugins", "PythonScriptPlugin", "Content", "Python", "remote_execution.py"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def discover_editor(engine_root: str) -> dict | None:
    """Discover a running UE Editor instance via UDP multicast."""
    re_path = _find_remote_execution(engine_root)
    if re_path:
        re_dir = os.path.dirname(re_path)
        if re_dir not in sys.path:
            sys.path.insert(0, re_dir)
        try:
            import remote_execution
            remote_exec = remote_execution.RemoteExecution()
            remote_exec.start()
            time.sleep(DISCOVERY_TIMEOUT)
            nodes = remote_exec.remote_nodes
            remote_exec.stop()
            if nodes:
                node = list(nodes.values())[0]
                return {"host": node.get("host", "127.0.0.1"), "port": node.get("port", 6776)}
        except Exception:
            pass

    # Fallback: manual UDP discovery
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.settimeout(DISCOVERY_TIMEOUT)
    try:
        sock.bind(("", MULTICAST_PORT))
        mreq = struct.pack("4sl", socket.inet_aton(MULTICAST_GROUP), socket.INADDR_ANY)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
    except OSError:
        return {"host": "127.0.0.1", "port": 6776}
    try:
        data, addr = sock.recvfrom(4096)
        try:
            info = json.loads(data.decode("utf-8", errors="replace"))
            return {"host": addr[0], "port": info.get("port", 6776)}
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {"host": addr[0], "port": 6776}
    except socket.timeout:
        return None
    finally:
        sock.close()


# ── TCP Command Execution ──────────────────────────────────────
def send_command(host: str, port: int, command: str, timeout: float) -> tuple:
    """Send a Python command via TCP and return (exit_code, output)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect((host, port))
        cmd_bytes = command.encode("utf-8")
        sock.sendall(struct.pack("<I", len(cmd_bytes)) + cmd_bytes)
        header = b""
        while len(header) < 4:
            chunk = sock.recv(4 - len(header))
            if not chunk:
                return 2, "Connection closed before receiving response header"
            header += chunk
        msg_len = struct.unpack("<I", header)[0]
        if msg_len > 10 * 1024 * 1024:
            return 2, f"Response too large ({msg_len} bytes)"
        data = b""
        start_time = time.time()
        while len(data) < msg_len:
            if time.time() - start_time > timeout:
                return 2, f"Timeout reading response ({len(data)}/{msg_len} bytes)"
            sock.settimeout(min(timeout - (time.time() - start_time), 1.0))
            try:
                chunk = sock.recv(min(msg_len - len(data), 65536))
            except socket.timeout:
                continue
            if not chunk:
                break
            data += chunk
        response = json.loads(data.decode("utf-8"))
        exit_code = 0 if response.get("success", False) else 1
        return exit_code, response.get("output", "No output")
    except socket.timeout:
        return 2, "Timeout connecting to Editor"
    except ConnectionRefusedError:
        return 2, "Connection refused — Editor may not have Remote Execution enabled"
    except Exception as e:
        return 2, f"Connection error: {e}"
    finally:
        sock.close()


def main():
    if len(sys.argv) < 2:
        print("Usage: ue_python.py <python_code> [timeout_seconds]", file=sys.stderr)
        sys.exit(2)
    command = sys.argv[1]
    timeout = float(sys.argv[2]) if len(sys.argv) >= 3 else 10.0
    engine_root = os.environ.get("UE_ENGINE_ROOT", "")
    if not engine_root:
        print("Error: UE_ENGINE_ROOT environment variable not set", file=sys.stderr)
        sys.exit(2)
    if not engine_root.endswith("Engine") and not engine_root.rstrip("/").endswith("Engine"):
        if os.path.isdir(os.path.join(engine_root, "Engine")):
            engine_root = os.path.join(engine_root, "Engine")
    editor = discover_editor(engine_root)
    if not editor:
        print("Error: No UE Editor found — ensure Editor is running and Remote Execution is enabled", file=sys.stderr)
        sys.exit(2)
    exit_code, output = send_command(editor["host"], editor["port"], command, timeout)
    print(output)
    if exit_code != 0:
        print(f"\n[ue_python.py exit_code={exit_code}]", file=sys.stderr)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
