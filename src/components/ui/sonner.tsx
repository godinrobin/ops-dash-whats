import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-zinc-950 group-[.toaster]:text-white group-[.toaster]:border group-[.toaster]:border-primary group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-zinc-300",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-zinc-800 group-[.toast]:text-zinc-300",
          success: "group-[.toaster]:border-primary",
          error: "group-[.toaster]:border-destructive",
          warning: "group-[.toaster]:border-yellow-500",
          info: "group-[.toaster]:border-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
