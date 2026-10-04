/**
 * 工作区路径沙箱守卫 (Sandbox Guard)
 *
 * 严格限制本地文件读写在受管工作区目录内，强力阻断路径遍历逃逸 (../)、符号链接穿透与宿主机敏感文件泄露
 *
 * @author Ateng
 * @since 2026-10-04
 */

import fs from "node:fs";
import path from "node:path";
import { SecurityError } from "../types/security.js";

/**
 * 本地沙箱隔离守卫
 */
export class SandboxGuard {
  private allowedBaseDir: string;

  public constructor(allowedBaseDir = "./") {
    this.allowedBaseDir = path.resolve(allowedBaseDir);
  }

  /**
   * 获取当前生效的规范化沙箱根目录绝对路径
   *
   * @return 沙箱绝对路径
   */
  public getBaseDir(): string {
    return this.allowedBaseDir;
  }

  /**
   * 解析路径或其最接近的已存在父目录的真实物理路径 (Symlink 展开)
   *
   * @param targetPath 目标绝对路径
   * @return 经过符号链接解析后的真实物理路径
   */
  private resolveRealPath(targetPath: string): string {
    if (fs.existsSync(targetPath)) {
      try {
        return fs.realpathSync(targetPath);
      } catch {
        return targetPath;
      }
    }

    // 若目标文件尚不存在，沿目录树逐层向上寻找首个已存在的父目录进行 realpath 解析
    let current = path.dirname(targetPath);
    const subSegments: string[] = [path.basename(targetPath)];

    while (!fs.existsSync(current) && path.dirname(current) !== current) {
      subSegments.unshift(path.basename(current));
      current = path.dirname(current);
    }

    if (fs.existsSync(current)) {
      try {
        const realCurrent = fs.realpathSync(current);
        return path.join(realCurrent, ...subSegments);
      } catch {
        return targetPath;
      }
    }

    return targetPath;
  }

  /**
   * 校验并规范化目标本地路径
   *
   * @param localPath 待校验的原始本地文件路径 (相对路径或绝对路径)
   * @return 经过沙箱约束校验的安全绝对路径
   * @throws 当路径为空、超出沙箱边界或通过 Symlink 逃逸时抛出 SecurityError
   */
  public validatePath(localPath: string): string {
    if (!localPath || localPath.trim() === "") {
      throw new SecurityError("SANDBOX_VIOLATION", "本地操作文件路径不能为空");
    }

    const trimmed = localPath.trim();
    // 1. 静态绝对路径计算
    const targetAbsolute = path.isAbsolute(trimmed)
      ? path.resolve(trimmed)
      : path.resolve(this.allowedBaseDir, trimmed);

    // 2. 静态相对路径边界校验
    const staticRelative = path.relative(this.allowedBaseDir, targetAbsolute);
    const isStaticEscaping = staticRelative.startsWith("..") || path.isAbsolute(staticRelative);

    if (isStaticEscaping) {
      throw new SecurityError(
        "SANDBOX_VIOLATION",
        `路径 "${localPath}" 超出受管本地工作区沙箱目录范围 ("${this.allowedBaseDir}")，已严厉阻断路径逃逸访问`
      );
    }

    // 3. 动态物理符号链接 (Symlink) 穿透逃逸校验
    const realBase = fs.existsSync(this.allowedBaseDir)
      ? fs.realpathSync(this.allowedBaseDir)
      : this.allowedBaseDir;
    const realTarget = this.resolveRealPath(targetAbsolute);

    const realRelative = path.relative(realBase, realTarget);
    const isRealEscaping = realRelative.startsWith("..") || path.isAbsolute(realRelative);

    if (isRealEscaping) {
      throw new SecurityError(
        "SANDBOX_VIOLATION",
        `检测到路径 "${localPath}" 试图通过符号链接 (Symlink) 穿透受管沙箱目录 ("${this.allowedBaseDir}")，已严厉阻断`
      );
    }

    return targetAbsolute;
  }
}
