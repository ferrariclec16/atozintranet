import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export function FullPageLoader() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <Loader2 className="w-12 h-12 text-primary animate-spin relative z-10" />
        </div>
        <p className="text-muted-foreground font-medium animate-pulse">로딩 중...</p>
      </motion.div>
    </div>
  );
}
