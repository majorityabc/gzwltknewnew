import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MathNodeView } from "./math-node-view";

export interface InlineMathOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    inlineMath: {
      setInlineMath: (text?: string) => ReturnType;
    };
  }
}

export const InlineMath = Node.create<InlineMathOptions>({
  name: "inlineMath",

  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      text: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-inline-math]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-inline-math": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },

  addCommands() {
    return {
      setInlineMath:
        (text = "") =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { text },
          });
        },
    };
  },
});
