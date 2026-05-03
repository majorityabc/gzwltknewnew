"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Underline from "@tiptap/extension-underline";
import ImageExt from "@tiptap/extension-image";
import { InlineMath } from "./math-extension";
import { Toolbar } from "./toolbar";

const FORMULA_CLASS = "formula-placeholder";

function cleanPastedHtml(html: string, imageDataUrls: string[]): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : html;

  body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<!--[\s\S]*?-->/g, "");
  body = body.replace(/<!\[if\s[^\]]*\]>/gi, "");
  body = body.replace(/<!\[endif\]>/gi, "");
  body = body.replace(/<o:p>\s*<\/o:p>/gi, "");
  body = body.replace(/\s*xmlns:[a-z]+="[^"]*"/gi, "");
  body = body.replace(/\s*class="?Mso[a-zA-Z]*"?/gi, "");

  body = body.replace(/style="([^"]*)"/gi, (_match, styles: string) => {
    const kept: string[] = [];
    for (const part of styles.split(";")) {
      const t = part.trim();
      if (!t) continue;
      if (/^\s*font-weight\s*:/i.test(t)) kept.push(t);
      else if (/^\s*font-style\s*:/i.test(t)) kept.push(t);
    }
    return kept.length ? `style="${kept.join(";")}"` : "";
  });

  body = body.replace(/<font[^>]*>/gi, "");
  body = body.replace(/<\/font>/gi, "");
  body = body.replace(/<span[^>]*>\s*<\/span>/gi, "");
  body = body.replace(/<p[^>]*>\s*<\/p>/gi, "");
  body = body.replace(/<(\w+)\s+>/g, "<$1>");
  body = body.replace(/<span\s*>/gi, "");
  body = body.replace(/<\/span>/gi, "");

  // Replace file:/// images with data URLs if available, otherwise style as placeholders
  let imgIdx = 0;
  body = body.replace(/<img[^>]*>/gi, (match: string) => {
    if (!/src="file:\/\/\//i.test(match)) return match;

    const dataUrl = imageDataUrls[imgIdx];
    imgIdx++;

    if (dataUrl) {
      // We have actual image data — replace the src
      return match.replace(/src="file:\/\/\/[^"]*"/i, `src="${dataUrl}"`);
    }

    // No image data — make a visible placeholder
    let cleaned = match.replace(/\s*class="?[^"]*"?/gi, "");
    cleaned = cleaned.replace("<img", `<img class="${FORMULA_CLASS}"`);
    if (!/alt="/i.test(cleaned)) {
      cleaned = cleaned.replace("<img", '<img alt="[公式]"');
    }
    if (!/title="/i.test(cleaned)) {
      cleaned = cleaned.replace("<img", '<img title="点击输入LaTeX公式"');
    }
    return cleaned;
  });

  return body;
}

async function readClipboardImages(): Promise<string[]> {
  try {
    const items = await navigator.clipboard.read();
    const result: string[] = [];

    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith("image/")) {
          const blob = await item.getType(type);
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          result.push(dataUrl);
        }
      }
    }

    console.log(`Clipboard images found: ${result.length}`);
    return result;
  } catch (e) {
    console.log("Clipboard read failed (may need permission):", e);
    return [];
  }
}

interface RichTextEditorProps {
  content?: string;
  onChange?: (html: string, json: object) => void;
  editable?: boolean;
}

export function RichTextEditor({
  content,
  onChange,
  editable = true,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        underline: false,
      }),
      Superscript,
      Subscript,
      Underline,
      ImageExt.configure({
        inline: true,
        allowBase64: true,
      }),
      InlineMath,
    ],
    content: content ? JSON.parse(content) : "",
    editable,
    editorProps: {
      attributes: {
        class: "tiptap-editor max-w-none focus:outline-none p-4",
      },
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData("text/html");
        if (!html) return false;

        event.preventDefault();

        // Try to read clipboard images asynchronously, then insert
        readClipboardImages().then((imageDataUrls) => {
          const cleaned = cleanPastedHtml(html, imageDataUrls);
          editor?.commands.insertContent(cleaned);
        });

        return true;
      },
      handleClickOn(view, pos, node, nodePos, event) {
        if (
          node.type.name === "image" &&
          node.attrs.src?.startsWith("file:///")
        ) {
          event.preventDefault();
          const latex = window.prompt(
            "输入 LaTeX 公式代码：\n\n例如：\\frac{v_0}{t}  分式\n      \\sqrt{x}  根号\n      v_0  下标\n      x^2  上标",
            "",
          );
          if (latex) {
            const { state, dispatch } = view;
            const mathNode = state.schema.nodes.inlineMath.create({
              text: latex,
            });
            const tr = state.tr.replaceWith(pos, pos + node.nodeSize, mathNode);
            dispatch(tr);
          }
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML(), editor.getJSON());
      }
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
