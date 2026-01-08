"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Style headings
          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-foreground" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-3 text-foreground" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-foreground" {...props} />,
          // Style paragraphs
          p: ({ node, ...props }) => <p className="mb-4 leading-relaxed text-foreground" {...props} />,
          // Style lists
          ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-4 space-y-1 text-foreground" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-4 space-y-1 text-foreground" {...props} />,
          li: ({ node, ...props }) => <li className="ml-4 text-foreground" {...props} />,
          // Style code
          code: ({ node, className, ...props }: any) => {
            const isInline = !className
            return isInline ? (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground" {...props} />
            ) : (
              <code className="block bg-muted p-3 rounded-lg text-sm font-mono overflow-x-auto text-foreground" {...props} />
            )
          },
          // Style links
          a: ({ node, ...props }) => (
            <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />
          ),
          // Style bold and italic
          strong: ({ node, ...props }) => <strong className="font-extrabold text-primary" {...props} />,
          em: ({ node, ...props }) => <em className="italic text-foreground" {...props} />,
          // Style blockquotes
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground" {...props} />
          ),
          // Preserve line breaks
          br: ({ node, ...props }) => <br {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

