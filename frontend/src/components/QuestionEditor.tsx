import React, { useRef } from 'react';
import { Editor } from '@tinymce/tinymce-react';

interface QuestionEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const QuestionEditor: React.FC<QuestionEditorProps> = ({ value, onChange }) => {
  const editorRef = useRef<any>(null);

  const handleEditorChange = (content: string) => {
    onChange(content);
  };

  return (
    <Editor
      tinymceScriptSrc="/tinymce/tinymce.min.js"
      onInit={(evt, editor) => editorRef.current = editor}
      value={value}
      onEditorChange={handleEditorChange}
      init={{
        height: 500,
        menubar: false,
        plugins: [
          'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
          'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
          'insertdatetime', 'media', 'table', 'preview', 'help', 'wordcount',
          'paste'
        ],
        toolbar: 'undo redo | blocks | ' +
          'bold italic underline strikethrough | subscript superscript | ' +
          'alignleft aligncenter alignright alignjustify | ' +
          'bullist numlist outdent indent | ' +
          'table image | ' +
          'removeformat | help',
        content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px }',
        paste_data_images: true,
        paste_as_text: false,
        paste_retain_style_properties: 'all',
        paste_merge_formats: true,
        automatic_uploads: true,
        images_upload_handler: async (blobInfo: any) => {
          const formData = new FormData();
          formData.append('upload', blobInfo.blob(), blobInfo.filename());

          try {
            const response = await fetch('/api/upload/image', {
              method: 'POST',
              body: formData
            });

            const data = await response.json();
            if (data.uploaded && data.url) {
              return data.url;
            }
            throw new Error('Upload failed');
          } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
          }
        },
        file_picker_types: 'image',
        image_advtab: true,
        image_caption: true,
        image_title: true,
        placeholder: '请输入题目内容，支持从 Word 粘贴（Ctrl+V）...'
      }}
    />
  );
};

export default QuestionEditor;
