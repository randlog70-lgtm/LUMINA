export interface ImportedChapter {
  title: string;
  content: string;
}

export async function exportToTxt(title: string, content: string) {
  const blob = new Blob([`${title}\n\n${content}`], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportToPdf(title: string, content: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxLineWidth = pageWidth - margin * 2;
  
  doc.setFontSize(20);
  doc.text(title, margin, 20);
  
  doc.setFontSize(12);
  const lines = doc.splitTextToSize(content, maxLineWidth);
  
  let cursorY = 35;
  const pageHeight = doc.internal.pageSize.getHeight();
  
  for (let i = 0; i < lines.length; i++) {
    if (cursorY > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
    }
    doc.text(lines[i], margin, cursorY);
    cursorY += 7; // line height
  }
  
  doc.save(`${title}.pdf`);
}

export async function exportToEpub(title: string, content: string) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  
  const metaInf = zip.folder("META-INF");
  metaInf?.file("container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  
  const oebps = zip.folder("OEBPS");
  oebps?.file("content.opf", `<?xml version="1.0"?><package version="3.0" unique-identifier="pub-id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title><dc:language>en</dc:language></metadata><manifest><item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="toc"><itemref idref="chapter1"/></spine></package>`);
  
  oebps?.file("toc.ncx", `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:12345"/></head><docTitle><text>${title}</text></docTitle><navMap><navPoint id="navPoint-1" playOrder="1"><navLabel><text>Chapter 1</text></navLabel><content src="chapter1.xhtml"/></navPoint></navMap></ncx>`);
  
  const formattedContent = content.split('\n').map(p => `<p>${p}</p>`).join('');
  oebps?.file("chapter1.xhtml", `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body><h1>${title}</h1>${formattedContent}</body></html>`);
  
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.epub`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFile(file: File): Promise<ImportedChapter[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const fileNameNoExt = file.name.replace(/\.[^/.]+$/, "");
  
  if (ext === 'txt') {
    const text = await file.text();
    return [{ title: fileNameNoExt, content: text }];
  } else if (ext === 'pdf') {
    const arrayBuffer = await file.arrayBuffer();
    
    if (!(window as any).pdfjsLib) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve();
        };
        script.onerror = () => reject(new Error('Failed to load pdf.js'));
        document.head.appendChild(script);
      });
    }
    
    const pdfjsLib = (window as any).pdfjsLib;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let chapters: ImportedChapter[] = [];
    let currentChapterTitle = fileNameNoExt;
    let currentContent = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      let lastY: number | null = null;
      let lastX: number | null = null;
      let pageText = '';
      
      // Sort items by Y (top to bottom) then X (left to right)
      const items = (textContent.items as any[]).sort((a, b) => {
        if (Math.abs(a.transform[5] - b.transform[5]) < 2) {
          return a.transform[4] - b.transform[4];
        }
        return b.transform[5] - a.transform[5];
      });

      for (const item of items) {
        const y = item.transform[5];
        const x = item.transform[4];
        
        if (lastY !== null) {
          const yDiff = Math.abs(y - lastY);
          if (yDiff > 5) {
            // New line
            pageText += '\n';
            if (yDiff > 12) pageText += '\n'; // Paragraph break
          } else if (lastX !== null && Math.abs(x - lastX) > 2 && !pageText.endsWith(' ')) {
            // Same line, but some distance between items
            pageText += ' ';
          }
        }
        
        pageText += item.str;
        lastY = y;
        lastX = x + (item.width || 0);
      }
      
      // Heuristic: Look for "Chapter X" or "Section X" at the start of a page
      const chapterMatch = pageText.trim().match(/^(Chapter|Section|Part)\s+(\d+|[IVXLCDM]+)/i) || 
                           pageText.trim().match(/^(\d+)\.\s+[A-Z]/);
      
      if (chapterMatch && currentContent.length > 500) {
        // Start a new chapter if we found a marker and have enough content in the previous one
        chapters.push({
          title: currentChapterTitle,
          content: currentContent.trim()
        });
        currentChapterTitle = chapterMatch[0];
        currentContent = pageText + '\n\n';
      } else {
        currentContent += pageText + '\n\n';
      }
      
      // Fallback: Split every 15 pages if no chapters detected and it's long
      if (chapters.length === 0 && i % 15 === 0 && i < pdf.numPages && currentContent.length > 2000) {
        chapters.push({
          title: `${fileNameNoExt} - Part ${Math.ceil(i / 15)}`,
          content: currentContent.trim()
        });
        currentContent = '';
      }
    }
    
    // Push the last chapter
    if (currentContent.trim()) {
      chapters.push({
        title: chapters.length === 0 ? fileNameNoExt : currentChapterTitle,
        content: currentContent.trim()
      });
    }
    
    return chapters;
  } else if (ext === 'epub') {
    const arrayBuffer = await file.arrayBuffer();
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    const containerXml = await zip.file("META-INF/container.xml")?.async("text");
    if (!containerXml) throw new Error("Invalid EPUB: No container.xml");
    
    const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
    const opfPath = opfPathMatch ? opfPathMatch[1] : "OEBPS/content.opf";
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';
    const opfContent = await zip.file(opfPath)?.async("text");
    if (!opfContent) throw new Error("Invalid EPUB: No OPF file");

    // Robust Manifest Parsing
    const manifestItems: Record<string, string> = {};
    const itemTags = opfContent.match(/<item\s+[^>]+>/g) || [];
    for (const tag of itemTags) {
      const idMatch = tag.match(/id="([^"]+)"/);
      const hrefMatch = tag.match(/href="([^"]+)"/);
      if (idMatch && hrefMatch) {
        manifestItems[idMatch[1]] = decodeURIComponent(hrefMatch[1]);
      }
    }

    // Robust Spine Parsing
    const spineItems: string[] = [];
    const itemrefTags = opfContent.match(/<itemref\s+[^>]+>/g) || [];
    for (const tag of itemrefTags) {
      const idrefMatch = tag.match(/idref="([^"]+)"/);
      if (idrefMatch) {
        spineItems.push(idrefMatch[1]);
      }
    }

    const extractTextFromHtml = (html: string) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const unwanted = doc.querySelectorAll('script, style, head, link, meta');
      unwanted.forEach(el => el.remove());

      let text = '';
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tagName = el.tagName.toUpperCase();
          const isParagraph = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'ARTICLE'].includes(tagName);
          const isLineBreak = tagName === 'BR';
          const isOtherBlock = ['DIV', 'LI', 'TR'].includes(tagName);
          
          if ((isParagraph || isOtherBlock) && text.length > 0 && !text.endsWith('\n')) {
            text += isParagraph ? '\n\n' : '\n';
          }
          
          for (let i = 0; i < el.childNodes.length; i++) {
            walk(el.childNodes[i]);
          }
          
          if (isParagraph && !text.endsWith('\n\n')) {
            text = text.trimEnd() + '\n\n';
          } else if ((isOtherBlock || isLineBreak) && !text.endsWith('\n')) {
            text = text.trimEnd() + '\n';
          }
        }
      };
      
      walk(doc.body);
      return text
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n/g, '\n\n') // Max two newlines
        .trim();
    };

    let chapters: ImportedChapter[] = [];
    for (let i = 0; i < spineItems.length; i++) {
      const idref = spineItems[i];
      const href = manifestItems[idref];
      if (!href) continue;

      // Handle paths correctly
      let fullPath = href;
      if (opfDir) {
        if (href.startsWith('../')) {
          const parts = opfDir.split('/');
          parts.pop();
          fullPath = parts.join('/') + '/' + href.replace('../', '');
        } else {
          fullPath = opfDir + '/' + href;
        }
      }
      
      const cleanPath = fullPath.split('#')[0];
      const fileData = zip.file(cleanPath);
      if (!fileData) continue;

      const htmlContent = await fileData.async('text');
      
      const titleMatch = htmlContent.match(/<h1[^>]*>(.*?)<\/h1>/i) || 
                         htmlContent.match(/<h2[^>]*>(.*?)<\/h2>/i) ||
                         htmlContent.match(/<title>(.*?)<\/title>/i);
                         
      const chapterTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>?/gm, '').trim() : `Chapter ${i + 1}`;
      const text = extractTextFromHtml(htmlContent);

      if (text.length > 100) {
        chapters.push({
          title: chapterTitle || `Chapter ${i + 1}`,
          content: text
        });
      }
    }

    if (chapters.length === 0) {
      let fullText = '';
      for (const [filename, fileData] of Object.entries(zip.files)) {
        if (filename.endsWith('.html') || filename.endsWith('.xhtml')) {
          const text = (await fileData.async('text')).replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
          fullText += text + '\n\n';
        }
      }
      return [{ title: fileNameNoExt, content: fullText }];
    }

    return chapters;
  }
  
  throw new Error('Unsupported file format');
}
