/**
 * Vérification hors ligne de la reconnaissance des vidéos de référence (src/lib/media-embed.ts). Aucun réseau.
 * Lancer : pnpm dlx tsx scripts/media-embed-selfcheck.ts
 */
import { autoplaySrc, imageSrc, mediaEmbed, type MediaEmbed } from "../src/lib/media-embed";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra: unknown = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${JSON.stringify(extra)}`); } };
const frame = (url: string) => { const m = mediaEmbed(url); return m?.kind === "iframe" ? m : null; };
const file = (url: string) => { const m = mediaEmbed(url); return m?.kind === "file" ? m : null; };
const link = (url: string) => { const m = mediaEmbed(url); return m?.kind === "link" ? m : null; };

console.log("Fichiers directs");
ok("mp4", file("https://cdn.exemple.fr/ref/clip.mp4")?.src === "https://cdn.exemple.fr/ref/clip.mp4");
ok("MOV en majuscules", !!file("https://cdn.exemple.fr/a/B.MOV"));
ok("webm et m4v", !!file("https://x.fr/a.webm") && !!file("https://x.fr/a.m4v"));
ok("lien de stockage signé", !!file("https://abc.supabase.co/storage/v1/object/sign/studio/clients/1/ref.mp4?token=eyJ.abc"));
ok("http (site inconnu) : jamais lu dans la page, simple lien", link("http://cdn.exemple.fr/clip.mp4")?.href === "http://cdn.exemple.fr/clip.mp4");
ok(".mp4 dans la requête seulement : simple lien", !!link("https://x.fr/watch?file=clip.mp4"));

console.log("YouTube");
const yt = frame("https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s");
ok("watch?v= → nocookie", yt?.src.startsWith("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ") === true, yt);
ok("début conservé (t=1m30s)", yt?.src.includes("start=90") === true, yt?.src);
ok("watch horizontal", yt?.vertical === false);
ok("youtu.be", frame("https://youtu.be/aqz-KE-bpKQ?si=xyz")?.src.startsWith("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ") === true);
const short = frame("https://youtube.com/shorts/aqz-KE-bpKQ");
ok("shorts → vertical", short?.vertical === true && short.href === "https://www.youtube.com/shorts/aqz-KE-bpKQ", short);
ok("m.youtube.com", !!frame("https://m.youtube.com/watch?v=aqz-KE-bpKQ"));
ok("sans https:// devant", !!frame("youtube.com/watch?v=aqz-KE-bpKQ"));
ok("http:// repassé en https", frame("http://www.youtube.com/watch?v=aqz-KE-bpKQ")?.provider === "youtube");
ok("identifiant trop court : lien", !!link("https://www.youtube.com/watch?v=abc"));
ok("identifiant piégé : lien", !!link("https://www.youtube.com/watch?v=aqz-KE-bpK%22"));
ok("chaîne YouTube : lien", !!link("https://www.youtube.com/@iconflow"));
ok("faux domaine youtube.com.evil.io : lien", !!link("https://youtube.com.evil.io/watch?v=aqz-KE-bpKQ"));
ok("autoplay en grand", autoplaySrc(yt!).includes("autoplay=1"));

console.log("Vimeo");
ok("vimeo.com/123", frame("https://vimeo.com/76979871")?.src === "https://player.vimeo.com/video/76979871");
ok("non répertoriée (hash)", frame("https://vimeo.com/76979871/8272103f6e")?.src === "https://player.vimeo.com/video/76979871?h=8272103f6e");
ok("player.vimeo.com", frame("https://player.vimeo.com/video/76979871?h=abc123")?.src === "https://player.vimeo.com/video/76979871?h=abc123");
ok("channels", !!frame("https://vimeo.com/channels/staffpicks/76979871"));
ok("groups", frame("https://vimeo.com/groups/motion/videos/76979871")?.src === "https://player.vimeo.com/video/76979871");
ok("vitrine (showcase) : lien, pas une vidéo", !!link("https://vimeo.com/showcase/11111111"));
ok("album : lien", !!link("https://vimeo.com/album/1234567"));
ok("page sans vidéo : lien", !!link("https://vimeo.com/iconflow"));

console.log("TikTok");
const tt = frame("https://www.tiktok.com/@lashea.fr/video/7312345678901234567?lang=fr");
ok("vidéo → player/v1", tt?.src === "https://www.tiktok.com/player/v1/7312345678901234567", tt);
ok("vertical", tt?.vertical === true);
ok("lien court vm.tiktok.com : lien", !!link("https://vm.tiktok.com/ZMabcdef/"));
ok("profil : lien", !!link("https://www.tiktok.com/@lashea.fr"));

console.log("Instagram");
ok("reel", frame("https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=abc")?.src === "https://www.instagram.com/reel/C1a2B3c4D5e/embed");
ok("reels", frame("https://instagram.com/reels/C1a2B3c4D5e/")?.src === "https://www.instagram.com/reel/C1a2B3c4D5e/embed");
ok("p", frame("https://www.instagram.com/p/C1a2B3c4D5e/")?.src === "https://www.instagram.com/p/C1a2B3c4D5e/embed");
ok("compte devant (/<compte>/reel/<code>)", frame("https://www.instagram.com/lashea.fr/reel/C1a2B3c4D5e/")?.src === "https://www.instagram.com/reel/C1a2B3c4D5e/embed");
ok("profil : lien", !!link("https://www.instagram.com/lashea.fr/"));

console.log("Google Drive, Loom, Dropbox");
ok("drive /file/d/", frame("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing")?.src === "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/preview");
ok("drive open?id=", !!frame("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345"));
ok("drive plusieurs comptes (/file/u/0/d/)", frame("https://drive.google.com/file/u/0/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view")?.src === "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/preview");
ok("drive dossier : lien", !!link("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345"));
ok("loom", frame("https://www.loom.com/share/0123456789abcdef0123456789abcdef?sid=1")?.src === "https://www.loom.com/embed/0123456789abcdef0123456789abcdef");
ok("loom identifiant invalide : lien", !!link("https://www.loom.com/share/pas-un-id"));
const db = file("https://www.dropbox.com/scl/fi/abc123/ref.mp4?rlkey=xyz&dl=0");
ok("dropbox ?dl=0 → ?raw=1", !!db && db.src.includes("raw=1") && !db.src.includes("dl=0") && db.src.includes("rlkey=xyz"), db);
ok("dropbox garde le lien d'origine", db?.href === "https://www.dropbox.com/scl/fi/abc123/ref.mp4?rlkey=xyz&dl=0");
ok("dropbox dossier : lien", !!link("https://www.dropbox.com/sh/abc/def?dl=0"));

console.log("Liens non reconnus et saisies invalides");
ok("Frame.io : lien", link("https://app.frame.io/reviews/abc")?.host === "app.frame.io");
ok("autre site : lien", !!link("https://exemple.fr/page"));
ok("vide", mediaEmbed("") === null && mediaEmbed("   ") === null && mediaEmbed(null) === null);
ok("texte libre", mediaEmbed("la vidéo de Léa") === null);
ok("javascript:", mediaEmbed("javascript:alert(1)") === null);
ok("data:", mediaEmbed("data:video/mp4;base64,AAAA") === null);
ok("identifiants dans l'URL", mediaEmbed("https://user:pass@www.youtube.com/watch?v=aqz-KE-bpKQ") === null);
ok("port exotique : simple lien", !!link("https://www.youtube.com:8443/watch?v=aqz-KE-bpKQ"));
ok("faux sous-domaines (vimeo, drive, instagram, tiktok) : lien", ["https://vimeo.com.evil.io/76979871", "https://drive.google.com.evil.io/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view", "https://instagram.com.evil.io/reel/C1a2B3c4D5e/", "https://tiktok.com.evil.io/@a/video/7312345678901234567"].every((s) => !!link(s)));
ok("guillemet dans l'identifiant : lien", !!link('https://www.youtube.com/watch?v=aqz-KE-bpKQ"><script>'));
ok("chemin ../ : lien", !!link("https://youtu.be/aqz-KE-bpKQ/../../evil"));
ok("//evil, file:, vbscript: refusés", mediaEmbed("//evil.io/a.mp4") === null && mediaEmbed("file:///etc/a.mp4") === null && mediaEmbed("vbscript:x") === null);

console.log("Aucun cadre vers une adresse non reconnue");
const ALLOWED = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/|www\.tiktok\.com\/player\/v1\/|www\.instagram\.com\/(reel|p)\/[^/]+\/embed$|drive\.google\.com\/file\/d\/[^/]+\/preview$|www\.loom\.com\/embed\/)/;
const samples = ["https://vimeo.com/showcase/11111111", "http://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://evil.vimeo.com/76979871", "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://youtu.be/aqz-KE-bpKQ", "https://vimeo.com/76979871", "https://www.tiktok.com/@a/video/7312345678901234567", "https://www.instagram.com/reel/C1a2B3c4D5e/", "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view", "https://www.loom.com/share/0123456789abcdef0123456789abcdef", "https://evil.example/embed?u=https://www.youtube.com/watch?v=aqz-KE-bpKQ"];
for (const s of samples) {
  const m: MediaEmbed | null = mediaEmbed(s);
  ok(`cadre sûr : ${s.slice(8, 48)}`, m?.kind !== "iframe" || ALLOWED.test(m.src), m);
}

console.log("Photos");
ok("https accepté", imageSrc(" https://images.exemple.fr/a.jpg ") === "https://images.exemple.fr/a.jpg");
ok("http repassé en https (comme le navigateur)", imageSrc("http://images.exemple.fr/a.jpg") === "https://images.exemple.fr/a.jpg");
ok("javascript: et data: refusés", imageSrc("javascript:alert(1)") === null && imageSrc("data:image/svg+xml,<svg onload=alert(1)>") === null);
ok("identifiants refusés", imageSrc("https://u:p@images.exemple.fr/a.jpg") === null);
ok("chemin de Fichiers refusé", imageSrc("clients/abc/Avatars/a.jpg") === null);

console.log(`\n${pass} ok, ${fail} échec(s)`);
if (fail) process.exit(1);
