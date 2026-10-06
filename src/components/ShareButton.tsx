"use client";

export function ShareButton({ title, text, url }: { title: string; text?: string; url?: string }) {
  const share = async () => {
    const link = url ?? window.location.href;
    fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "share", path: link }) }).catch(() => {});
    if (navigator.share) await navigator.share({ title, text, url: link }).catch(() => {});
    else {
      await navigator.clipboard.writeText(link);
      alert("Link copied!");
    }
  };
  return (
    <button className="btn cyan" onClick={share}>
      Share
    </button>
  );
}
