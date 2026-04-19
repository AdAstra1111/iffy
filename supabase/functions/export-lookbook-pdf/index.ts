/**
 * export-lookbook-pdf — Renders Look Book slides to a studio-grade PDF with images.
 * Uses EdgeRuntime.waitUntil() for background processing to avoid CPU time limits.
 * POST { projectId, lookBookData }
 * Returns { job_id } — client polls export_jobs table for completion.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, PDFImage } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Types ──
interface SlideContent {
  type: string;
  title?: string;
  subtitle?: string;
  body?: string;
  bodySecondary?: string;
  bullets?: string[];
  quote?: string;
  imageUrl?: string;
  imageUrls?: string[];
  backgroundImageUrl?: string;
  imageCaption?: string;
  characters?: Array<{ name: string; role: string; description: string; imageUrl?: string }>;
  comparables?: Array<{ title: string; reason: string }>;
  credit?: string;
  companyName?: string;
  roledImages?: Array<{ url: string; role: string }>;
}

interface LookBookColorSystem {
  bg: string;
  bgSecondary: string;
  text: string;
  textMuted: string;
  accent: string;
}

interface LookBookData {
  projectId: string;
  projectTitle: string;
  identity: {
    colors: LookBookColorSystem;
    typography: { titleFont: string; bodyFont: string; titleUppercase: boolean };
  };
  slides: SlideContent[];
  deckFormat?: 'landscape' | 'portrait';
  writerCredit: string;
  companyName: string;
}

// ── Helpers ──
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

function pdfColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return rgb(r, g, b);
}

function sanitize(text: string): string {
  return text.replace(/[\n\r\t]/g, ' ').replace(/[\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
}

function wrapText(rawText: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const text = sanitize(rawText);
  if (!text) return [];
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    const w = font.widthOfTextAtSize(test, size);
    if (w > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ── Image fetching & embedding ──
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`LLM call timed out after ${timeoutMs/1000}s`)), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAndEmbed(pdfDoc: PDFDocument, url: string, cache: Map<string, PDFImage | null>): Promise<PDFImage | null> {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url)!;
  try {
    // Request reduced-size image via Supabase Storage transform params
    const separator = url.includes('?') ? '&' : '?';
    const optimizedUrl = `${url}${separator}width=800&quality=80`;

    const resp = await fetchWithTimeout(optimizedUrl, 8000);
    if (!resp.ok) { cache.set(url, null); return null; }
    const buf = new Uint8Array(await resp.arrayBuffer());

    // Always try JPEG embedding first (essentially a byte-copy, very low CPU).
    // Only fall back to PNG if JPEG fails — PNG embedding is ~10x more CPU-intensive.
    let img: PDFImage;
    try {
      img = await pdfDoc.embedJpg(buf);
    } catch {
      // Fallback: likely a PNG
      try {
        img = await pdfDoc.embedPng(buf);
      } catch (e2) {
        console.warn(`[export-lookbook-pdf] Could not embed image (neither JPG nor PNG): ${url}`, e2);
        cache.set(url, null);
        return null;
      }
    }
    cache.set(url, img);
    return img;
  } catch (e) {
    console.warn(`[export-lookbook-pdf] Failed to fetch image: ${url}`, e);
    cache.set(url, null);
    return null;
  }
}

function drawImageFit(
  page: PDFPage, img: PDFImage,
  x: number, y: number, maxW: number, maxH: number,
  opacity = 1,
) {
  const iw = img.width;
  const ih = img.height;
  const scale = Math.min(maxW / iw, maxH / ih);
  const w = iw * scale;
  const h = ih * scale;
  page.drawImage(img, { x, y, width: w, height: h, opacity });
}

function drawImageCover(
  page: PDFPage, img: PDFImage,
  pageW: number, pageH: number, opacity = 0.35,
) {
  const iw = img.width;
  const ih = img.height;
  const scale = Math.max(pageW / iw, pageH / ih);
  const w = iw * scale;
  const h = ih * scale;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  page.drawImage(img, { x, y, width: w, height: h, opacity });
}

function collectImageUrls(slides: SlideContent[]): string[] {
  const urls = new Set<string>();
  for (const s of slides) {
    if (s.imageUrl) urls.add(s.imageUrl);
    if (s.backgroundImageUrl) urls.add(s.backgroundImageUrl);
    s.imageUrls?.forEach(u => u && urls.add(u));
    s.characters?.forEach(c => c.imageUrl && urls.add(c.imageUrl));
    s.roledImages?.forEach(r => r.url && urls.add(r.url));
  }
  return Array.from(urls);
}

// ── Background PDF generation ──
async function generatePdf(
  jobId: string,
  userId: string,
  projectId: string,
  lookBookData: LookBookData,
) {
  const sbUrl = Deno.env.get("SUPABASE_URL")!;
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(sbUrl, sbKey);

  try {
    const isPortrait = lookBookData.deckFormat === 'portrait';
    const PAGE_W = isPortrait ? 720 : 1280;
    const PAGE_H = isPortrait ? 1280 : 720;
    const MARGIN = isPortrait ? 60 : 80;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    console.log(`[export-lookbook-pdf] job=${jobId} deckFormat=${lookBookData.deckFormat || 'landscape'} slides=${lookBookData.slides.length}`);

    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontSans = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const colors = lookBookData.identity.colors;
    const bgColor = pdfColor(colors.bg);
    const textColor = pdfColor(colors.text);
    const mutedColor = pdfColor(colors.textMuted);
    const accentColor = pdfColor(colors.accent);

    // Pre-fetch images sequentially in small batches to stay under CPU limit
    const imageCache = new Map<string, PDFImage | null>();
    const allUrls = collectImageUrls(lookBookData.slides);
    console.log(`[export-lookbook-pdf] Pre-fetching ${allUrls.length} images in batches`);

    // Process images sequentially to avoid CPU spikes
    console.log(`[export-lookbook-pdf] Embedding ${allUrls.length} images sequentially`);

    for (let i = 0; i < allUrls.length; i++) {
      await fetchAndEmbed(pdfDoc, allUrls[i], imageCache);

      // Update progress every 2 images
      if (i % 2 === 0 || i === allUrls.length - 1) {
        const progress = Math.round(((i + 1) / allUrls.length) * 60);
        await sb.from('export_jobs').update({ progress, updated_at: new Date().toISOString() }).eq('id', jobId);
      }
    }

    // Filter out unresolved slides (fail-closed enforcement at document boundary)
    const resolvedSlides = lookBookData.slides.filter(
      (s: any) => s._resolutionStatus !== 'unresolved'
    );
    console.log(`[export-lookbook-pdf] Rendering ${resolvedSlides.length}/${lookBookData.slides.length} resolved slides`);

    // Render slides
    for (let si = 0; si < resolvedSlides.length; si++) {
      const slide = resolvedSlides[si];
      const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

      page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: bgColor });

      if (slide.backgroundImageUrl) {
        const bgImg = imageCache.get(slide.backgroundImageUrl);
        if (bgImg) {
          drawImageCover(page, bgImg, PAGE_W, PAGE_H, 0.3);
          page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: bgColor, opacity: 0.55 });
        }
      }

      page.drawRectangle({ x: MARGIN, y: PAGE_H - MARGIN - 4, width: 50, height: 2, color: accentColor });

      switch (slide.type) {
        case 'cover':
        case 'closing':
          renderCoverPage(page, slide, fontBold, fontRegular, fontSans, textColor, mutedColor, accentColor, lookBookData, PAGE_W, PAGE_H, MARGIN, CONTENT_W, isPortrait, imageCache);
          break;
        case 'characters':
          renderCharactersPage(page, slide, fontBold, fontRegular, fontSansBold, fontSans, textColor, mutedColor, accentColor, PAGE_W, PAGE_H, MARGIN, CONTENT_W, isPortrait, imageCache);
          break;
        case 'comparables':
          renderComparablesPage(page, slide, fontBold, fontRegular, fontSansBold, fontSans, textColor, mutedColor, accentColor, PAGE_W, PAGE_H, MARGIN, CONTENT_W, isPortrait);
          break;
        default:
          renderContentPage(page, slide, fontBold, fontRegular, fontSans, textColor, mutedColor, accentColor, PAGE_W, PAGE_H, MARGIN, CONTENT_W, isPortrait, imageCache);
          break;
      }

      if (slide.type !== 'cover' && slide.type !== 'closing') {
        const pageNum = `${String(si + 1).padStart(2, '0')} / ${String(resolvedSlides.length).padStart(2, '0')}`;
        page.drawText(pageNum, {
          x: PAGE_W - MARGIN - fontSans.widthOfTextAtSize(pageNum, 8),
          y: 30, size: 8, font: fontSans, color: mutedColor, opacity: 0.4,
        });
      }

      const slideProgress = 60 + Math.round(((si + 1) / resolvedSlides.length) * 30);
      await sb.from('export_jobs').update({ progress: slideProgress, updated_at: new Date().toISOString() }).eq('id', jobId);
    }

    await sb.from('export_jobs').update({ progress: 92, updated_at: new Date().toISOString() }).eq('id', jobId);

    const pdfBytes = await pdfDoc.save();

    const storagePath = `${userId}/${projectId}/${Date.now()}_lookbook.pdf`;
    const { error: uploadErr } = await sb.storage
      .from("exports")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: signedData } = await sb.storage
      .from("exports")
      .createSignedUrl(storagePath, 3600);

    await sb.from('export_jobs').update({
      status: 'completed',
      progress: 100,
      storage_path: storagePath,
      signed_url: signedData?.signedUrl || null,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    console.log(`[export-lookbook-pdf] job=${jobId} completed`);
  } catch (err: any) {
    console.error(`[export-lookbook-pdf] job=${jobId} failed:`, err);
    await sb.from('export_jobs').update({
      status: 'failed',
      error: err.message,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(sbUrl, sbKey);

    const anonClient = createClient(sbUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { projectId, lookBookData } = await req.json() as {
      projectId: string;
      lookBookData: LookBookData;
    };

    if (!projectId || !lookBookData?.slides?.length) {
      return new Response(JSON.stringify({ error: "Missing data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create job record
    const { data: job, error: jobErr } = await sb.from('export_jobs').insert({
      user_id: user.id,
      project_id: projectId,
      status: 'processing',
      progress: 0,
    }).select().single();

    if (jobErr || !job) {
      throw new Error(`Failed to create export job: ${jobErr?.message}`);
    }

    // Start background processing
    EdgeRuntime.waitUntil(generatePdf(job.id, user.id, projectId, lookBookData));

    // Return immediately with job ID
    return new Response(
      JSON.stringify({ job_id: job.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("export-lookbook-pdf error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Render functions ──

function renderCoverPage(
  page: PDFPage, slide: SlideContent,
  fontBold: PDFFont, fontRegular: PDFFont, fontSans: PDFFont,
  textColor: any, mutedColor: any, accentColor: any,
  data: LookBookData,
  PAGE_W: number, PAGE_H: number, MARGIN: number, CONTENT_W: number,
  isPortrait: boolean,
  imageCache: Map<string, PDFImage | null>,
) {
  const heroUrl = slide.imageUrl;
  if (heroUrl) {
    const heroImg = imageCache.get(heroUrl);
    if (heroImg) {
      if (isPortrait) {
        drawImageCover(page, heroImg, PAGE_W, PAGE_H * 0.45, 0.85);
      } else {
        const imgW = PAGE_W * 0.45;
        const imgH = PAGE_H - MARGIN * 2;
        drawImageFit(page, heroImg, PAGE_W - MARGIN - imgW, MARGIN, imgW, imgH, 0.9);
      }
    }
  }

  const title = slide.title || data.projectTitle;
  const titleSize = title.length > 20 ? 48 : 64;
  const titleMaxW = isPortrait ? CONTENT_W : CONTENT_W * 0.5;
  const titleLines = wrapText(title.toUpperCase(), fontBold, titleSize, titleMaxW);
  const titleY = isPortrait ? PAGE_H * 0.38 : PAGE_H * 0.45;

  titleLines.forEach((line, i) => {
    page.drawText(line, {
      x: MARGIN, y: titleY - i * (titleSize * 1.2),
      size: titleSize, font: fontBold, color: textColor,
    });
  });

  if (slide.subtitle) {
    const subLines = wrapText(slide.subtitle, fontRegular, 16, titleMaxW);
    subLines.forEach((line, i) => {
      page.drawText(line, {
        x: MARGIN,
        y: titleY - titleLines.length * (titleSize * 1.2) - 20 - i * 22,
        size: 16, font: fontRegular, color: mutedColor,
      });
    });
  }

  if (slide.credit) {
    page.drawText(sanitize(slide.credit), {
      x: MARGIN, y: 60, size: 10, font: fontSans, color: accentColor, opacity: 0.8,
    });
  }
  if (slide.companyName) {
    page.drawText(sanitize(slide.companyName), {
      x: MARGIN, y: 42, size: 9, font: fontSans, color: mutedColor, opacity: 0.5,
    });
  }
}

function renderContentPage(
  page: PDFPage, slide: SlideContent,
  fontBold: PDFFont, fontRegular: PDFFont, fontSans: PDFFont,
  textColor: any, mutedColor: any, accentColor: any,
  PAGE_W: number, PAGE_H: number, MARGIN: number, CONTENT_W: number,
  isPortrait: boolean,
  imageCache: Map<string, PDFImage | null>,
) {
  const label = (slide.type || '').replace(/_/g, ' ').toUpperCase();
  page.drawText(label, {
    x: MARGIN, y: PAGE_H - MARGIN - 20,
    size: 8, font: fontSans, color: accentColor, opacity: 0.7,
  });

  const titleSize = isPortrait ? 32 : 36;
  page.drawText(sanitize(slide.title || ''), {
    x: MARGIN, y: PAGE_H - MARGIN - 60,
    size: titleSize, font: fontBold, color: textColor,
  });

  const foregroundImgs: PDFImage[] = [];
  const urls = slide.imageUrls?.length ? slide.imageUrls : (slide.imageUrl ? [slide.imageUrl] : []);
  for (const u of urls) {
    const img = imageCache.get(u);
    if (img) foregroundImgs.push(img);
  }

  const hasImages = foregroundImgs.length > 0;
  const textWidth = hasImages
    ? (isPortrait ? CONTENT_W * 0.85 : CONTENT_W * 0.48)
    : (isPortrait ? CONTENT_W * 0.85 : CONTENT_W * 0.6);

  let cursorY = PAGE_H - MARGIN - 100;

  if (slide.body) {
    const lines = wrapText(slide.body, fontRegular, 14, textWidth);
    for (const line of lines) {
      if (cursorY < 60) break;
      page.drawText(line, {
        x: MARGIN, y: cursorY, size: 14, font: fontRegular, color: textColor, opacity: 0.9,
      });
      cursorY -= 20;
    }
    cursorY -= 10;
  }

  if (slide.bodySecondary) {
    const lines = wrapText(slide.bodySecondary, fontRegular, 12, textWidth);
    for (const line of lines) {
      if (cursorY < 60) break;
      page.drawText(line, {
        x: MARGIN, y: cursorY, size: 12, font: fontRegular, color: mutedColor,
      });
      cursorY -= 18;
    }
  }

  if (slide.bullets?.length) {
    let bulletY = isPortrait ? cursorY - 20 : PAGE_H - MARGIN - 100;
    const bulletX = isPortrait ? MARGIN : (hasImages ? MARGIN : PAGE_W * 0.55);
    const bulletWidth = isPortrait ? CONTENT_W * 0.85 : (hasImages ? textWidth - 20 : CONTENT_W * 0.4);
    for (const bullet of slide.bullets) {
      if (bulletY < 60) break;
      page.drawCircle({ x: bulletX, y: bulletY + 4, size: 2, color: accentColor });
      const bLines = wrapText(bullet, fontRegular, 12, bulletWidth);
      for (const bl of bLines) {
        page.drawText(bl, {
          x: bulletX + 12, y: bulletY, size: 12, font: fontRegular, color: textColor, opacity: 0.85,
        });
        bulletY -= 18;
      }
      bulletY -= 6;
    }
  }

  if (hasImages) {
    if (isPortrait) {
      const imgAreaY = 60;
      const imgAreaH = Math.min(cursorY - 80, PAGE_H * 0.35);
      if (imgAreaH > 80) {
        const count = Math.min(foregroundImgs.length, 3);
        const gap = 16;
        const imgW = (CONTENT_W - gap * (count - 1)) / count;
        foregroundImgs.slice(0, count).forEach((img, i) => {
          drawImageFit(page, img, MARGIN + i * (imgW + gap), imgAreaY, imgW, imgAreaH, 0.95);
        });
      }
    } else {
      const imgX = PAGE_W * 0.54;
      const imgAreaW = PAGE_W - imgX - MARGIN;
      const imgAreaH = PAGE_H - MARGIN * 2 - 40;
      if (foregroundImgs.length === 1) {
        drawImageFit(page, foregroundImgs[0], imgX, MARGIN + 20, imgAreaW, imgAreaH, 0.95);
      } else {
        const count = Math.min(foregroundImgs.length, 4);
        const cols = count <= 2 ? 1 : 2;
        const rows = Math.ceil(count / cols);
        const gap = 12;
        const cellW = (imgAreaW - gap * (cols - 1)) / cols;
        const cellH = (imgAreaH - gap * (rows - 1)) / rows;
        foregroundImgs.slice(0, count).forEach((img, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cx = imgX + col * (cellW + gap);
          const cy = MARGIN + 20 + (rows - 1 - row) * (cellH + gap);
          drawImageFit(page, img, cx, cy, cellW, cellH, 0.95);
        });
      }
    }
  }

  if (slide.quote) {
    page.drawText(`"${sanitize(slide.quote)}"`, {
      x: MARGIN, y: 60, size: 11, font: fontRegular, color: mutedColor,
    });
  }

  if (slide.imageCaption && hasImages) {
    page.drawText(sanitize(slide.imageCaption), {
      x: MARGIN, y: 44, size: 8, font: fontSans, color: mutedColor, opacity: 0.5,
    });
  }
}

function renderCharactersPage(
  page: PDFPage, slide: SlideContent,
  fontBold: PDFFont, fontRegular: PDFFont,
  fontSansBold: PDFFont, fontSans: PDFFont,
  textColor: any, mutedColor: any, accentColor: any,
  PAGE_W: number, PAGE_H: number, MARGIN: number, CONTENT_W: number,
  isPortrait: boolean,
  imageCache: Map<string, PDFImage | null>,
) {
  page.drawText('CHARACTERS', {
    x: MARGIN, y: PAGE_H - MARGIN - 20,
    size: 8, font: fontSans, color: accentColor, opacity: 0.7,
  });
  page.drawText(slide.title || 'Characters', {
    x: MARGIN, y: PAGE_H - MARGIN - 60,
    size: isPortrait ? 32 : 36, font: fontBold, color: textColor,
  });

  const chars = slide.characters || [];
  if (isPortrait) {
    for (let i = 0; i < Math.min(chars.length, 5); i++) {
      const c = chars[i];
      const y = PAGE_H - MARGIN - 120 - i * 200;
      if (y < 60) break;

      const charImg = c.imageUrl ? imageCache.get(c.imageUrl) : null;
      const textX = charImg ? MARGIN + 130 : MARGIN;
      const descW = charImg ? CONTENT_W - 150 : CONTENT_W - 20;

      if (charImg) {
        drawImageFit(page, charImg, MARGIN, y - 140, 110, 160, 0.95);
      }

      page.drawText(sanitize(c.name), {
        x: textX, y, size: 18, font: fontSansBold, color: accentColor,
      });
      if (c.role) {
        page.drawText(sanitize(c.role).toUpperCase(), {
          x: textX, y: y - 24, size: 8, font: fontSans, color: mutedColor,
        });
      }
      if (c.description) {
        const lines = wrapText(c.description, fontRegular, 11, descW);
        lines.slice(0, 6).forEach((line, li) => {
          page.drawText(line, {
            x: textX, y: y - 44 - li * 16,
            size: 11, font: fontRegular, color: textColor, opacity: 0.85,
          });
        });
      }
    }
  } else {
    const colW = (CONTENT_W - 40) / 2;
    for (let i = 0; i < Math.min(chars.length, 4); i++) {
      const c = chars[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * (colW + 40);
      const y = PAGE_H - MARGIN - 120 - row * 220;

      const charImg = c.imageUrl ? imageCache.get(c.imageUrl) : null;
      const textX = charImg ? x + 100 : x;
      const descW = charImg ? colW - 120 : colW - 20;

      if (charImg) {
        drawImageFit(page, charImg, x, y - 150, 85, 170, 0.95);
      }

      page.drawText(sanitize(c.name), {
        x: textX, y, size: 18, font: fontSansBold, color: accentColor,
      });
      if (c.role) {
        page.drawText(sanitize(c.role).toUpperCase(), {
          x: textX, y: y - 24, size: 8, font: fontSans, color: mutedColor,
        });
      }
      if (c.description) {
        const lines = wrapText(c.description, fontRegular, 11, descW);
        lines.slice(0, 5).forEach((line, li) => {
          page.drawText(line, {
            x: textX, y: y - 44 - li * 16,
            size: 11, font: fontRegular, color: textColor, opacity: 0.85,
          });
        });
      }
    }
  }
}

function renderComparablesPage(
  page: PDFPage, slide: SlideContent,
  fontBold: PDFFont, fontRegular: PDFFont,
  fontSansBold: PDFFont, fontSans: PDFFont,
  textColor: any, mutedColor: any, accentColor: any,
  PAGE_W: number, PAGE_H: number, MARGIN: number, CONTENT_W: number,
  isPortrait: boolean,
) {
  page.drawText('MARKET POSITIONING', {
    x: MARGIN, y: PAGE_H - MARGIN - 20,
    size: 8, font: fontSans, color: accentColor, opacity: 0.7,
  });
  page.drawText(slide.title || 'Comparables', {
    x: MARGIN, y: PAGE_H - MARGIN - 60,
    size: isPortrait ? 32 : 36, font: fontBold, color: textColor,
  });

  const comps = slide.comparables || [];
  const spacing = isPortrait ? 120 : 100;
  comps.slice(0, isPortrait ? 6 : 4).forEach((c, i) => {
    const y = PAGE_H - MARGIN - 120 - i * spacing;
    if (y < 60) return;
    const num = String(i + 1).padStart(2, '0');
    page.drawText(num, {
      x: MARGIN, y, size: 28, font: fontBold, color: accentColor, opacity: 0.3,
    });
    page.drawText(sanitize(c.title), {
      x: MARGIN + 50, y, size: 18, font: fontSansBold, color: textColor,
    });
    if (c.reason) {
      const lines = wrapText(c.reason, fontRegular, 11, CONTENT_W - 60);
      lines.slice(0, 3).forEach((line, li) => {
        page.drawText(line, {
          x: MARGIN + 50, y: y - 22 - li * 16,
          size: 11, font: fontRegular, color: mutedColor,
        });
      });
    }
  });
}
