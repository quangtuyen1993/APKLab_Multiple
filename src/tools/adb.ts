import * as fs from "fs";
import * as path from "path";
import { executeProcess, executeProcessOutput } from "../utils/executor";
import { isSplitApk } from "../utils/base_apk_utils";

export namespace adb {
    /**
     * Installs the selected APK file to connected android device over ADB.
     * @param apkFilePath absolute path of the APK file.
     */
    export async function installAPK(apkFilePath: string): Promise<void> {
        const apkFileName = path.basename(apkFilePath);
        if (apkFileName == "base.apk") {
            await installAdbMultiple(apkFilePath);
            return;
        }
        const report = `Installing ${apkFileName}`;
        const args = ["install", "-r", apkFilePath];
        await executeProcess({
            name: "Installing",
            report: report,
            command: "adb",
            args: args,
        });
    }

    export async function installAdbMultiple(
        apkFilePath: string,
    ): Promise<void> {
        const apks = [apkFilePath];
        const parentFolder = path.dirname(apkFilePath);
        const files = await fs.promises.readdir(parentFolder);
        for (const file of files) {
            if (isSplitApk(file)) {
                const splitApkPath = path.join(parentFolder, file);
                apks.push(splitApkPath);
            }
        }
        const args = ["install-multiple", ...apks];
        await executeProcess({
            name: "Installing Split APKs",
            report: `Installing split APKs from ${parentFolder}`,
            command: "adb",
            args: args,
        });
    }

    export async function package_list(): Promise<string[]> {
        const report = "Get APKs list from connected device";
        const args = ["shell", "pm", "list", "packages"];
        const rawOutput = await executeProcessOutput({
            name: "Listing Packages",
            report: report,
            command: "adb",
            args: args,
        });

        const packageList = rawOutput
            .split("\n")
            .filter((line) => line.startsWith("package:"))
            .map((line) => line.replace("package:", "").trim());
        return packageList;
    }

    export async function pullAPK(
        packageName: string,
        dir: string,
    ): Promise<void> {
        const report = `Pulling APK from device: ${dir}`;
        const args = [
            "shell",
            "pm",
            "path",
            `${packageName}`,
            "|",
            "sed",
            "s/package://",
        ];
        const apks = await executeProcessOutput({
            name: "Pulling APK",
            report: report,
            command: "adb",
            args: args,
        });

        const apkPaths = apks.split("\n").filter((line) => line.trim() !== "");
        if (apkPaths.length === 0) {
            throw new Error(`No APK found for package: ${packageName}`);
        }

        for (const apkPath of apkPaths) {
            const apkFileName = path.basename(apkPath);
            const targetPath = path.join(dir, apkFileName);
            const pullArgs = ["pull", apkPath, targetPath];
            await executeProcess({
                name: "Pulling APK",
                report: `Pulling ${apkFileName} to ${dir}`,
                command: "adb",
                args: pullArgs,
            });
        }
    }
}
