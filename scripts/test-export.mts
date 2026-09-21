import { createRequire } from "module";
const require_ = createRequire(import.meta.url);
/* 真实管线测试：snapshot 数据 → 转换 → exportBlocksToDocxDownload → 检查 docx 里的图片 */
let captured: any = null;
const RealURL: any = URL;
RealURL.createObjectURL = (b: any) => {
  captured = b;
  return "blob:test";
};
RealURL.revokeObjectURL = () => {};
const { JSDOM } = require_("jsdom");
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
// jsdom Image 对 dataURL 不触发任何事件（会挂起）→ 用假 Image 走 onerror 兜底 400x200
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0; naturalHeight = 0;
  set src(_v: string) { setImmediate(() => (this.onerror ? this.onerror() : this.onload?.())); }
}
(globalThis as any).Image = FakeImage;
dom.window.URL.createObjectURL = RealURL.createObjectURL;
dom.window.URL.revokeObjectURL = RealURL.revokeObjectURL;

setTimeout(() => { console.log("⏰ 看门狗: 90秒超时强制退出"); process.exit(9); }, 90000).unref();

async function main() {
  // Node 下 Packer.toBlob 可能不可用，先打补丁指向 toBuffer（不影响验证渲染逻辑）
  const docx = await import("docx");
  (docx.Packer as any).toBlob = async (d: any) => {
    const buf = await (docx.Packer as any).toBuffer(d);
    return new Blob([buf]);
  };

  const { exportBlocksToDocxDownload } = await import("../src/lib/export-docx");
  const { docParagraphsToTipTapJson } = await import("../src/lib/tip-tap-converter");
  const fs = await import("fs");

  const paras = JSON.parse(fs.readFileSync(process.argv[2] || "/tmp/snap_paras.json", "utf8"));

  // 1) 转换后 image 节点计数
  const doc: any = docParagraphsToTipTapJson(paras);
  let imgNodes = 0;
  JSON.stringify(doc, (_k, v) => {
    if (v && typeof v === "object" && v.type === "image") imgNodes++;
    return v;
  });
  console.log("步骤1 转换后 image 节点数:", imgNodes);

  // 2) 真实导出函数
  await exportBlocksToDocxDownload("测试卷", doc.content);
  await new Promise((r) => setTimeout(r, 500));

  if (!captured) {
    console.log("步骤2 未捕获到 blob —— 导出函数中途异常或没走到下载");
    return;
  }
  const buf = Buffer.from(await captured.arrayBuffer());
  fs.writeFileSync("/tmp/snap_test.docx", buf);
  console.log("步骤2 docx 生成:", buf.length, "bytes → /tmp/snap_test.docx");

  // 3) 解压看 media
  const { execSync } = await import("child_process");
  const ls = execSync("unzip -l /tmp/snap_test.docx | grep media || echo NO_MEDIA")
    .toString()
    .trim();
  console.log("步骤3 docx 内媒体文件:\n" + ls);
}

main().catch((e) => {
  console.error("测试脚本异常:", e);
  process.exit(1);
});
