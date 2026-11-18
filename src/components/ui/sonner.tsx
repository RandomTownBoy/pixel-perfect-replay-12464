import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Notifikasi bertema gelap Kyoka: kartu membulat, aksen warna per jenis, maksimal 2 tampil sekaligus dan cepat hilang agar tidak memenuhi layar. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      visibleToasts={2}
      duration={2200}
      offset={16}
      className="toaster group"
      style={
        {
          "--normal-bg": "color-mix(in oklab, var(--card) 92%, transparent)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "color-mix(in oklab, var(--card) 92%, transparent)",
          "--success-text": "var(--foreground)",
          "--success-border": "color-mix(in oklab, var(--success) 55%, transparent)",
          "--error-bg": "color-mix(in oklab, var(--card) 92%, transparent)",
          "--error-text": "var(--foreground)",
          "--error-border": "color-mix(in oklab, var(--destructive) 65%, transparent)",
          "--border-radius": "16px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !border !px-4 !py-3 !text-sm !font-medium !shadow-xl !backdrop-blur-md",
          description: "!text-muted-foreground",
          actionButton: "!rounded-lg !bg-primary !text-primary-foreground",
          cancelButton: "!rounded-lg !bg-muted !text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
