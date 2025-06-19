import * as path from "path";
import * as fs from "fs";
import { commands, QuickPickItem, Uri, window, workspace } from "vscode";
import * as vscode from "vscode";
import { extensionConfigName, outputChannel } from "./data/constants";
import { quickPickUtil } from "./utils/quick-picks";
import { Quark } from "./tools/quark-engine";
import { apktool } from "./tools/apktool";
import { adb } from "./tools/adb";
import { jadx } from "./tools/jadx";
import { git } from "./tools/git";
import { moveApksToTarget } from "./utils/base_apk_utils";

interface DivideArgsResult {
    args: string[];
    decompileJava: boolean;
    quarkAnalysis: boolean;
    jadxArgs: string[];
}

export namespace UI {
    /**
     * Show a QuickPick with multiple items.
     * @param items QuickPickItems to show in the QuickPick.
     * @param placeHolder Place holder text in the box under QuickPick.
     * @returns string[] of the label for selected QuickPickItem[].
     */
    export async function showArgsQuickPick(
        items: QuickPickItem[],
        placeHolder: string,
    ): Promise<QuickPickItem[] | undefined> {
        return await window.showQuickPick(items, {
            placeHolder: placeHolder,
            canPickMany: true,
            matchOnDetail: true,
            matchOnDescription: true,
            ignoreFocusOut: true,
        });
    }

    export async function pull_apk_emulator(folderName: string): Promise<void> {
        const listPackage = await adb.package_list();
        const result = await window.showQuickPick(listPackage, {
            placeHolder: "Select a package to pull",
            canPickMany: false,
            matchOnDetail: true,
        });
        if (!result) {
            outputChannel.appendLine("APKLAB: no package was chosen");
            return;
        }
        await adb.pullAPK(result, folderName);
        const files = (await fs.promises.readdir(folderName)).filter(
            (file) => file.endsWith(".apk"),
        );
        const apkDesc = files.length == 1 ? path.join(folderName, files[0]) : folderName;
        await _extraSource([Uri.file(apkDesc)]);
    }

    /**
     * Show a APK file chooser window and decompile that APK.
     */
    export async function openApkFile(): Promise<void> {
        // browse for an APK file
        const result = await window.showOpenDialog({
            canSelectFolders: false,
            filters: {
                APK: ["apk"],
            },
            openLabel: "Select an APK file",
        });
        if (result && result.length > 0) {
            await _extraSource(result);
        }
    }

    export async function _extraSource(
        result: Uri[] | undefined,
    ): Promise<DivideArgsResult | undefined> {
        if (result && result.length === 1) {
            const quickPickItems = await showArgsQuickPick(
                quickPickUtil.getQuickPickItems("decodeQuickPickItems"),
                "Additional features & Apktool/Jadx arguments",
            );

            if (quickPickItems) {
                const args = quickPickItems.map<string>((item) => item.label);
                const argDescriptions = quickPickItems.map<string | undefined>(
                    (item) => item.description,
                );
                const decompileJavaIndex =
                    argDescriptions.indexOf("[Use Jadx]");
                const quarkAnalysisIndex =
                    argDescriptions.indexOf("[Use Quark-Engine]");
                const jadxOptionsIndex = argDescriptions.indexOf("jadx");
                const jadxOptionsNumber = argDescriptions.filter(
                    (item) => item === "jadx",
                ).length;
                let decompileJava = false;
                let quarkAnalysis = false;
                let jadxArgs: string[] = [];
                if (jadxOptionsIndex > -1) {
                    jadxArgs = args.splice(jadxOptionsIndex, jadxOptionsNumber);
                }
                if (decompileJavaIndex > -1) {
                    decompileJava = true;
                    args.splice(decompileJavaIndex, 1);
                }
                if (quarkAnalysisIndex > -1) {
                    quarkAnalysis = true;
                    args.splice(quarkAnalysisIndex, 1);
                    if (!Quark.checkQuarkInstalled()) {
                        quarkAnalysis = false;
                        window.showErrorMessage(
                            "APKLab: Quark command not found, \
                            please make sure you have installed python3 and Quark-Engine. \
                            Check here to install Quark-Engine: \
                            https://github.com/quark-engine/quark-engine",
                        );
                        return;
                    }
                }

                const stat = await vscode.workspace.fs.stat(result[0]);
                const selected_file = result[0].fsPath;
                const isDirectory = stat.type === vscode.FileType.Directory;
                const apkFilePath = isDirectory
                    ? path.join(selected_file, "base.apk")
                    : selected_file;

                // project directory name
                // const apkFilePath = result[0].fsPath;
                let projectDir = path.join(
                    path.dirname(apkFilePath),
                    isDirectory
                        ? path.parse(selected_file).name
                        : path.parse(apkFilePath).name,
                );

                // don't delete the existing dir if it already exists
                while (fs.existsSync(projectDir)) {
                    projectDir = projectDir + "1";
                }

                // decode APK
                await apktool.decodeAPK(apkFilePath, projectDir, args);

                // decompile APK
                if (decompileJava) {
                    await jadx.decompileAPK(apkFilePath, projectDir, jadxArgs);
                }
                // quark analysis
                if (quarkAnalysis) {
                    await Quark.analyzeAPK(apkFilePath, projectDir);
                }

                if (isDirectory) {
                    const targetResource = path.join(projectDir, "resources");
                    await moveApksToTarget(selected_file, targetResource);
                }

                // Initialize project dir as git repo
                const initializeGit = workspace
                    .getConfiguration(extensionConfigName)
                    .get("initProjectDirAsGit");
                if (initializeGit)
                    await git.initGitDir(projectDir, "Initial APKLab project");

                // open project dir in a new window
                if (!process.env["TEST"]) {
                    await commands.executeCommand(
                        "vscode.openFolder",
                        Uri.file(projectDir),
                        true,
                    );
                }
            }
        } else {
            outputChannel.appendLine("APKLAB: no APK file was chosen");
        }
    }

    /**
     * Show a QuickPick with extra args and build the APK.
     * @param apktoolYmlPath path of the `apktool.yml` file.
     */
    export async function rebuildAPK(apktoolYmlPath: string): Promise<void> {
        const quickPickItems = await showArgsQuickPick(
            quickPickUtil.getQuickPickItems("rebuildQuickPickItems"),
            "Additional Apktool arguments",
        );
        const args = quickPickItems
            ? quickPickItems.map<string>((item) => item.label)
            : undefined;
        if (args) {
            await apktool.rebuildAPK(apktoolYmlPath, args);
        }
    }
}
