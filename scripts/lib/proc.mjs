import { execFileSync } from 'node:child_process';

/**
 * @typedef {{ pid: number, name: string, cmd: string }} Proc
 */

/** @returns {Proc[]} */
function listProcesses() {
	if (process.platform === 'win32') {
		try {
			const out = execFileSync(
				'powershell.exe',
				[
					'-NoProfile',
					'-NonInteractive',
					'-Command',
					'Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress'
				],
				{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
			);
			/** @type {{ ProcessId: number, Name: string, CommandLine: string | null }[]} */
			const rows = [JSON.parse(out)].flat();
			return rows.map((r) => ({ pid: r.ProcessId, name: r.Name ?? '', cmd: r.CommandLine ?? '' }));
		} catch {
			// No PowerShell: tasklist still finds workerd.exe, just without command lines.
			const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' });
			return out
				.split(/\r?\n/)
				.filter(Boolean)
				.map((line) => {
					const [name, pid] = line.split('","').map((s) => s.replace(/"/g, ''));
					return { pid: Number(pid), name, cmd: '' };
				});
		}
	}
	const out = execFileSync('ps', ['-eo', 'pid=,comm=,args='], { encoding: 'utf8' });
	return out
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
			return m ? { pid: Number(m[1]), name: m[2], cmd: m[3] } : { pid: 0, name: '', cmd: line };
		});
}

/**
 * Running workerd / `wrangler dev` processes. Any of them can hold a lock on
 * `.svelte-kit/cloudflare` (Windows EPERM), which makes the adapter step fail
 * after `vite build` already rewrote the server output: the half-build that
 * broke production on 2026-10-12. `vite dev` is covered too, because its
 * platform proxy runs workerd.
 * @returns {Proc[]}
 */
export function findDevServers() {
	return listProcesses().filter(
		(p) =>
			p.pid !== process.pid &&
			(/^workerd(\.exe)?$/i.test(p.name) ||
				/\bwrangler(\.js|\.cmd)?["']?\s+(.*\s)?dev\b/.test(p.cmd))
	);
}
