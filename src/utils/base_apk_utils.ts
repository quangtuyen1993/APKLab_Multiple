import * as fs from "fs";
import * as path from "path";
import { executeProcessOutput } from "./executor";

export async function moveApksToTarget(
    sourceDir: string,
    targetDir: string,
): Promise<void> {
    const files = await fs.promises.readdir(sourceDir);
    if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true });
    }
    for (const file of files) {
        if (isSplitApk(file)) {
            const src = path.join(sourceDir, file);
            const dest = path.join(targetDir, file);
            console.log(`Moving ${file} to ${targetDir}`);
            const a = await executeProcessOutput({
                name: "Moving APKs",
                report: `Moving ${file} to ${targetDir}`,
                command: "mv",
                args: [src, dest],
            });
            console.log(a);
        }
    }
}

export function isSplitApk(fileName: string): boolean {
    return /^split_config\..+\.apk$/.test(fileName);
}
