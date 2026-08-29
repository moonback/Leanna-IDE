import { Skill } from "./base";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { SELF_ROOT, normalizeSelfPath, resolveRealPathWithinSelf } from "../utils/selfRoot";
import { requestConfirmation } from "../utils/confirmationBridge";

const execFileAsync = promisify(execFile);

// Retourne la racine du projet actif sélectionné par l'utilisateur (SELF_ROOT).
function getProjectRoot(): string {
    return SELF_ROOT;
}

/**
 * Resolves `target` against the project root and rejects anything that
 * escapes it *textually*. Delegates to the centralized normalizeSelfPath.
 */
function normalizeProjectPath(target: string): string | null {
    return normalizeSelfPath(target);
}

/**
 * SECURITY: guards against symlink escape. Delegates to resolveRealPathWithinSelf.
 */
async function resolveRealPathWithinProject(candidatePath: string): Promise<string | null> {
    return resolveRealPathWithinSelf(candidatePath);
}

const EXEC_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 5 * 1024 * 1024; // 5 Mo

const ALLOWED_COMMANDS = ["dir", "ls", "npm"] as const;
const ALLOWED_NPM_SUBCOMMANDS = [
    "install", "i", "uninstall", "remove", "rm",
    "run", "update", "ci", "ls", "list", "outdated", "audit", "test"
] as const;

// ── run_project_command — commandes autorisées ────────────────────────────────
// Préfixes de commandes autorisés pour run_project_command.
// Seuls ces préfixes sont acceptés ; tout autre préfixe est rejeté.
const RUN_ALLOWED_PREFIXES = ["npm ", "npx ", "node "] as const;

// Sous-commandes npm qui NE nécessitent PAS de confirmation interactive
// (lecture/exécution locale sans modification du disque/réseau).
const NPM_NO_CONFIRM = new Set(["run", "test", "audit", "ls", "list", "outdated"]);

const RUN_TIMEOUT_MS = 120_000; // 2 minutes max

/**
 * Détermine si une commande npm nécessite une confirmation utilisateur.
 * Les commandes qui modifient node_modules (install, uninstall, update, ci) nécessitent
 * une confirmation explicite ; les scripts (run, test) et audits peuvent s'exécuter sans.
 */
function npmNeedsConfirmation(parts: string[]): boolean {
    // parts[0] === "npm", parts[1] === subcommand
    const sub = (parts[1] ?? "").toLowerCase();
    return !NPM_NO_CONFIRM.has(sub);
}

function truncate(str: string, max = 2000): string {
    return str.length > max ? str.slice(0, max) + "... [tronqué]" : str;
}

function asString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

// BUGFIX (injection de commande critique) : la regex précédente
// `/[;&|`$<>]/` ne filtrait pas les retours à la ligne (\n, \r) ni les autres
// caractères de contrôle. Comme la commande était ensuite exécutée via
// `sh -c command` / `cmd.exe /c command`, une chaîne comme
// "npm run build\nrm -rf /" passait le contrôle puis exécutait une seconde
// commande arbitraire. On bloque désormais tout caractère de contrôle et les
// métacaractères shell usuels (guillemets, glob, sous-shell, chemin parent).
//
// SECURITY (renforcement) : `^` et `%` ont été ajoutés à la liste. La
// commande npm est exécutée via `execFile(..., { shell: true })`, qui sur
// Windows invoque cmd.exe. Dans cmd.exe, `^` est le caractère d'échappement
// (permettant de neutraliser un autre filtre) et `%VAR%` déclenche une
// expansion de variable d'environnement (fuite d'information, voire
// exécution si une variable contrôlée par l'attaquant existe). La virgule et
// `@` sont également des séparateurs/opérateurs reconnus par cmd.exe dans
// certains contextes et sont bloqués par prudence.
function isSafeShellCommand(command: string): boolean {
    if (/[\x00-\x1f\x7f]/.test(command)) return false; // \n \r \t et autres contrôles
    return !/[;&|`$<>(){}[\]"'*?~!\\^%,@]/.test(command) && !command.includes("..");
}

function globToRegex(glob: string): RegExp {
    const escaped = glob.replace(/[.+^${}()|\\+]/g, '\\$&');
    const regexStr = '^' + escaped
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/\[!(.*?)\]/g, '[^$1]')
        .replace(/\[(.*?)\]/g, '[$1]') + '$';
    return new RegExp(regexStr);
}

export const systemSkill: Skill = {
    name: "system",
    declarations: [
        {
            name: "system_open",
            description: "Ouvre une application, un dossier ou un fichier sur l'ordinateur local (ex: code, notepad, chemin vers dossier).",
            parameters: {
                type: "OBJECT",
                properties: {
                    target: {
                        type: "STRING",
                        description: "Le nom du programme ou le chemin à ouvrir (ex: 'code', 'calc', '/usr/bin/python')"
                    }
                },
                required: ["target"]
            }
        },
        {
            name: "system_notify",
            description: "Envoie une notification système sur l'ordinateur de l'utilisateur.",
            parameters: {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING", description: "Le titre de la notification" },
                    message: { type: "STRING", description: "Le contenu de la notification" }
                },
                required: ["title", "message"]
            }
        },
        {
            name: "system_info",
            description: "Récupère des informations sur le système local (CPU, RAM, OS).",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "run_project_command",
            description: "Exécute une commande npm, npx ou node dans le workspace du projet et retourne stdout/stderr. Commandes autorisées : npm run <script>, npm install <pkg>, npm uninstall <pkg>, npm test, npm audit, npx <outil>, node <script.js>. Les commandes qui modifient node_modules (install, uninstall, update, ci) nécessitent une confirmation utilisateur interactive. Idéal pour lancer des builds, installer des dépendances, exécuter des scripts ou vérifier la compilation.",
            parameters: {
                type: "OBJECT",
                properties: {
                    command: {
                        type: "STRING",
                        description: "Commande complète à exécuter (ex: 'npm run build', 'npm install axios', 'npx tsc --noEmit', 'node scripts/setup.js')."
                    },
                    cwd: {
                        type: "STRING",
                        description: "Sous-dossier relatif dans lequel exécuter la commande (optionnel, défaut: racine du projet). Ex: 'packages/frontend'."
                    }
                },
                required: ["command"]
            }
        },
        {
            name: "system_execute_command",
            description: "Exécute une commande shell restreinte (dir, ls, npm) sur le workspace du projet et retourne le résultat. Les commandes npm nécessitent que 'confirmed' soit explicitement à true (confirmation utilisateur préalable) — l'appel est refusé sinon.",
            parameters: {
                type: "OBJECT",
                properties: {
                    command: { type: "STRING", description: "La commande shell restreinte à exécuter (dir, ls, ou npm sur le projet)" },
                    confirmed: { type: "BOOLEAN", description: "Doit être true pour les commandes npm, attestant que l'utilisateur a explicitement confirmé l'exécution." }
                },
                required: ["command"]
            }
        }
    ],

    handleToolCall: async (name, args: Record<string, unknown>, toolContext?: { emitToClient?: (data: any) => void }) => {
        try {
            switch (name) {
                case "run_project_command": {
                    const rawCmd = asString(args.command).trim();
                    if (!rawCmd) return { error: "Paramètre 'command' manquant ou vide." };

                    // Vérifier le préfixe autorisé
                    const allowed = RUN_ALLOWED_PREFIXES.some(p => rawCmd.toLowerCase().startsWith(p));
                    if (!allowed) {
                        return { error: `Commande non autorisée. Seuls les préfixes suivants sont acceptés: ${RUN_ALLOWED_PREFIXES.join(", ")}. Exemple: 'npm run build', 'npx tsc --noEmit'.` };
                    }

                    // Bloquer les caractères dangereux
                    if (!isSafeShellCommand(rawCmd)) {
                        return { error: "Commande refusée : caractères shell dangereux détectés." };
                    }

                    const parts = rawCmd.split(/\s+/);
                    const verb = parts[0].toLowerCase();

                    // Résoudre le cwd
                    const root = getProjectRoot();
                    let cwdPath = root;
                    if (args.cwd) {
                        const subDir = asString(args.cwd).trim();
                        const resolved = normalizeProjectPath(subDir);
                        if (!resolved) return { error: "Le sous-dossier 'cwd' doit rester dans le workspace du projet." };
                        if (!fs.existsSync(resolved)) return { error: `Sous-dossier introuvable: ${subDir}` };
                        cwdPath = resolved;
                    }

                    // Les commandes npm qui modifient node_modules nécessitent une confirmation
                    if (verb === "npm" && npmNeedsConfirmation(parts)) {
                        if (!toolContext?.emitToClient) {
                            return { error: "Confirmation interactive indisponible dans ce contexte. Exécutez la commande manuellement dans le terminal." };
                        }
                        const approved = await requestConfirmation(
                            rawCmd,
                            "npm-command",
                            toolContext.emitToClient,
                            `Exécuter dans le projet : ${rawCmd}`
                        );
                        if (!approved) {
                            return { error: "Commande refusée par l'utilisateur." };
                        }
                    }

                    console.log(`[System] run_project_command: ${rawCmd} (cwd: ${cwdPath})`);

                    const isWin = os.platform() === "win32";
                    let bin: string;
                    let binArgs: string[];

                    if (verb === "npm") {
                        bin = isWin ? "npm.cmd" : "npm";
                        binArgs = parts.slice(1);
                    } else if (verb === "npx") {
                        bin = isWin ? "npx.cmd" : "npx";
                        binArgs = parts.slice(1);
                    } else {
                        // node
                        bin = isWin ? "node.exe" : "node";
                        binArgs = parts.slice(1);
                    }

                    try {
                        const result = await execFileAsync(bin, binArgs, {
                            cwd: cwdPath,
                            timeout: RUN_TIMEOUT_MS,
                            maxBuffer: MAX_BUFFER,
                            shell: false,
                            env: { ...process.env },
                        });
                        return {
                            status: "success",
                            command: rawCmd,
                            cwd: cwdPath,
                            stdout: truncate(result.stdout ?? "", 6000),
                            stderr: truncate(result.stderr ?? "", 3000),
                            exitCode: 0,
                        };
                    } catch (e: any) {
                        return {
                            status: "error",
                            command: rawCmd,
                            cwd: cwdPath,
                            stdout: truncate(e.stdout ?? "", 6000),
                            stderr: truncate(e.stderr ?? e.message ?? "", 3000),
                            exitCode: typeof e.code === "number" ? e.code : null,
                            error: e.killed ? `Commande interrompue (timeout ${RUN_TIMEOUT_MS / 1000}s dépassé)` : e.message,
                        };
                    }
                }

                case "system_open": {
                    const target = asString(args.target).trim();
                    if (!target) return { error: "Paramètre 'target' manquant ou vide." };

                    console.log(`[System] Demande d'ouverture de: ${target}`);
                    const platform = os.platform();

                    const resolvedPath = normalizeProjectPath(target);
                    if (!resolvedPath) {
                        return { error: "Le chemin doit rester dans le workspace du projet." };
                    }

                    if (!fs.existsSync(resolvedPath)) {
                        return { error: `Le chemin demandé n'existe pas dans le projet: ${target}` };
                    }

                    // SECURITY: suit les symlinks pour vérifier que la cible
                    // réelle reste bien dans le projet (voir commentaire sur
                    // resolveRealPathWithinProject).
                    const realPath = await resolveRealPathWithinProject(resolvedPath);
                    if (!realPath) {
                        return { error: "Le chemin résolu (après suivi des liens symboliques) sort du workspace du projet." };
                    }

                    try {
                        if (platform === "win32") {
                            await execFileAsync("cmd.exe", ["/c", "start", "", realPath], { timeout: EXEC_TIMEOUT_MS });
                        } else if (platform === "darwin") {
                            await execFileAsync("open", [realPath], { timeout: EXEC_TIMEOUT_MS });
                        } else {
                            await execFileAsync("xdg-open", [realPath], { timeout: EXEC_TIMEOUT_MS });
                        }
                        return { status: "success", message: `Ouverture réussie: ${realPath}` };
                    } catch (error: any) {
                        return { error: `Erreur d'ouverture: ${error.message}` };
                    }
                }

                case "system_notify": {
                    const title = asString(args.title, "Notification");
                    const message = asString(args.message);
                    console.log(`[System] Notification: ${title}`);
                    const platform = os.platform();

                    try {
                        if (platform === "win32") {
                            // Titre/message passés via variables d'environnement pour éviter
                            // toute injection dans la commande PowerShell.
                            await execFileAsync(
                                "powershell",
                                [
                                    "-NoProfile",
                                    "-Command",
                                    "Add-Type -AssemblyName System.Windows.Forms; " +
                                    "[System.Windows.Forms.MessageBox]::Show($env:NOTIF_MSG, $env:NOTIF_TITLE)"
                                ],
                                { timeout: EXEC_TIMEOUT_MS, env: { ...process.env, NOTIF_MSG: message, NOTIF_TITLE: title } }
                            );
                        } else if (platform === "darwin") {
                            await execFileAsync(
                                "osascript",
                                [
                                    "-e",
                                    'display notification (system attribute "NOTIF_MSG") with title (system attribute "NOTIF_TITLE")'
                                ],
                                { timeout: EXEC_TIMEOUT_MS, env: { ...process.env, NOTIF_MSG: message, NOTIF_TITLE: title } }
                            );
                        } else {
                            await execFileAsync("notify-send", [title, message], { timeout: EXEC_TIMEOUT_MS });
                        }
                        return { status: "success" };
                    } catch (error: any) {
                        return { error: `Impossible d'afficher la notification: ${error.message}` };
                    }
                }

                case "system_info": {
                    try {
                        const info = {
                            platform: os.platform(),
                            release: os.release(),
                            arch: os.arch(),
                            cpus: os.cpus().length,
                            totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
                            freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
                            uptimeHours: Math.round(os.uptime() / 3600)
                        };
                        return { status: "success", info };
                    } catch (error: any) {
                        return { error: `Erreur de récupération des infos système: ${error.message}` };
                    }
                }

                case "system_execute_command": {
                    const command = asString(args.command).trim();
                    if (!command) return { error: "Paramètre 'command' manquant ou vide." };

                    const commandParts = command.split(/\s+/);
                    const verb = commandParts[0].toLowerCase();
                    const targetArg = commandParts.slice(1).join(" ").trim();

                    if (!ALLOWED_COMMANDS.includes(verb as any)) {
                        return { error: `Seules les commandes suivantes sont autorisées : ${ALLOWED_COMMANDS.join(", ")}. Uniquement sur des chemins à l'intérieur du projet.` };
                    }

                    // ── npm commands ───────────────────────────────────────────────
                    if (verb === "npm") {
                        // SECURITY: args.confirmed was previously passed from the LLM
                        // tool call and could be forged. We now require a real
                        // interactive user confirmation via the WebSocket bridge.
                        if (!toolContext?.emitToClient) {
                            return { error: "Contexte de confirmation indisponible — aucune confirmation interactive n'est possible." };
                        }

                        if (!isSafeShellCommand(command)) {
                            return { error: "Commande non autorisée : caractères shell dangereux détectés." };
                        }

                        const npmSubcommand = commandParts[1]?.toLowerCase();

                        if (!npmSubcommand || !ALLOWED_NPM_SUBCOMMANDS.includes(npmSubcommand as any)) {
                            return { error: `Sous-commande npm non autorisée. Commandes autorisées : ${ALLOWED_NPM_SUBCOMMANDS.join(", ")}` };
                        }

                        const npmApproved = await requestConfirmation(
                            getProjectRoot(),
                            'npm-command',
                            toolContext.emitToClient,
                            `Exécuter npm ${commandParts.slice(1).join(" ")}`
                        );
                        if (!npmApproved) {
                            return { error: "Commande npm refusée par l'utilisateur ou expirée." };
                        }

                        console.log(`[System] Exécution npm: ${command} dans ${getProjectRoot()}`);
                        // SECURITY (Audit §2) : Avertir si npm install avec des paquets spécifiques
                        if ((npmSubcommand === "install" || npmSubcommand === "i") && commandParts.length > 2) {
                            console.warn(`[System] ⚠️ npm install avec paquets spécifiques: ${commandParts.slice(2).join(" ")}`);
                        }
                        const NPM_TIMEOUT_MS = 120_000; // 2 minutes pour npm

                        try {
                            const npmBin = os.platform() === "win32" ? "npm.cmd" : "npm";
                            const result = await execFileAsync(npmBin, commandParts.slice(1), {
                                timeout: NPM_TIMEOUT_MS,
                                maxBuffer: MAX_BUFFER,
                                cwd: getProjectRoot(),
                                shell: false
                            });
                            return {
                                status: "success",
                                stdout: truncate(result.stdout ?? "", 4000),
                                stderr: truncate(result.stderr ?? "", 2000),
                                error: null
                            };
                        } catch (error: any) {
                            return {
                                status: "error",
                                stdout: truncate(error.stdout ?? "", 4000),
                                stderr: truncate(error.stderr ?? "", 2000),
                                error: error.killed ? "Commande interrompue (timeout dépassé — 2 min)" : error.message
                            };
                        }
                    }

                    // ── dir / ls commands ─────────────────────────────────────────
                    // Sanitize path arguments (allow glob chars but block command injection / escapes)
                    if (targetArg && (/[\x00-\x1f\x7f]/.test(targetArg) || /[;&|`$<>(){}"']/.test(targetArg) || targetArg.includes(".."))) {
                        return { error: "Chemin non autorisé : métacaractères shell dangereux ou chemin relatif parent détecté." };
                    }

                    try {
                        let matched: fs.Dirent[] = [];
                        let normalizedDir = getProjectRoot();
                        const sanitizedArg = targetArg.replace(/^"|"$/g, "").replace(/^'|'$/g, "");

                        const hasGlob = /[*?[\]]/.test(sanitizedArg);

                        if (hasGlob) {
                            // Extract directory and glob pattern
                            const dirPart = path.dirname(sanitizedArg);
                            const patternPart = path.basename(sanitizedArg);

                            const validatedDir = normalizeProjectPath(dirPart);
                            if (!validatedDir) {
                                return { error: "Le chemin doit rester dans le workspace du projet." };
                            }

                            if (!fs.existsSync(validatedDir)) {
                                return { error: `Répertoire introuvable: ${dirPart}` };
                            }
                            const stats = await fs.promises.stat(validatedDir);
                            if (!stats.isDirectory()) {
                                return { error: `Le chemin n'est pas un répertoire : ${dirPart}` };
                            }

                            // SECURITY: vérifie que le répertoire réel (après
                            // résolution des liens symboliques) reste dans le projet.
                            const realDir = await resolveRealPathWithinProject(validatedDir);
                            if (!realDir) {
                                return { error: "Le répertoire résolu (après suivi des liens symboliques) sort du workspace du projet." };
                            }
                            normalizedDir = realDir;

                            const regex = globToRegex(patternPart);
                            const entries = await fs.promises.readdir(normalizedDir, { withFileTypes: true });
                            matched = entries.filter(e => regex.test(e.name));
                        } else {
                            // No glob, standard dir / ls listing
                            const targetPath = sanitizedArg || ".";
                            const validatedPath = normalizeProjectPath(targetPath);
                            if (!validatedPath) {
                                return { error: "Le chemin doit rester dans le workspace du projet." };
                            }

                            if (!fs.existsSync(validatedPath)) {
                                return { error: `Chemin introuvable: ${targetPath}` };
                            }

                            // SECURITY: idem, on suit les liens symboliques
                            // avant d'accepter le chemin.
                            const realPath = await resolveRealPathWithinProject(validatedPath);
                            if (!realPath) {
                                return { error: "Le chemin résolu (après suivi des liens symboliques) sort du workspace du projet." };
                            }

                            const stats = await fs.promises.stat(realPath);
                            if (stats.isDirectory()) {
                                normalizedDir = realPath;
                                matched = await fs.promises.readdir(realPath, { withFileTypes: true });
                            } else {
                                // Single file match
                                normalizedDir = path.dirname(realPath);
                                const filename = path.basename(realPath);
                                matched = [
                                    {
                                        name: filename,
                                        isDirectory: () => false,
                                        isFile: () => true,
                                        isBlockDevice: () => false,
                                        isCharacterDevice: () => false,
                                        isSymbolicLink: () => false,
                                        isFIFO: () => false,
                                        isSocket: () => false
                                    } as fs.Dirent
                                ];
                            }
                        }

                        // Format outputs to match dir/ls expectations
                        let output = `Répertoire de ${normalizedDir}\n\n`;
                        let dirCount = 0;
                        let fileCount = 0;
                        let totalSize = 0;

                        const lines = matched.map(async (entry) => {
                            const fullPath = path.join(normalizedDir, entry.name);
                            const entryStats = await fs.promises.stat(fullPath).catch(() => null);
                            if (!entryStats) {
                                return `                     ${entry.name}`;
                            }
                            const dateStr = entryStats.mtime.toLocaleDateString('fr-FR') + '  ' + entryStats.mtime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                            if (entry.isDirectory()) {
                                dirCount++;
                                return `${dateStr}    <DIR>          ${entry.name}`;
                            } else {
                                fileCount++;
                                totalSize += entryStats.size;
                                return `${dateStr}             ${entryStats.size.toLocaleString('fr-FR')} ${entry.name}`;
                            }
                        });

                        const resolvedLines = await Promise.all(lines);
                        output += resolvedLines.join('\n');
                        output += `\n\n               ${fileCount} fichier(s)             ${totalSize.toLocaleString('fr-FR')} octets\n`;
                        output += `               ${dirCount} Dossier(s)\n`;

                        return {
                            status: "success",
                            stdout: truncate(output, 8000),
                            stderr: "",
                            error: null
                        };
                    } catch (error: any) {
                        return {
                            status: "error",
                            stdout: "",
                            stderr: error.message,
                            error: error.message
                        };
                    }
                }

                default:
                    return { error: `Outil inconnu: ${name}` };
            }
        } catch (error: any) {
            // Filet de sécurité pour toute exception non prévue
            return { error: `Erreur inattendue: ${error?.message ?? String(error)}` };
        }
    }
};