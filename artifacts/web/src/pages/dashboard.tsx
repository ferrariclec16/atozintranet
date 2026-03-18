import { Sidebar } from "@/components/layout/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Wrench, Sparkles, Clock, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: auth } = useAuth();
  const user = auth?.user;

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-h-screen relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px] translate-y-1/2 pointer-events-none" />

        {/* Header */}
        <header className="h-20 px-8 flex items-center justify-between border-b border-border/30 bg-background/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Workspace</span>
            <span className="text-border">/</span>
            <span className="text-foreground font-medium">대시보드</span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-8 md:p-12 max-w-7xl mx-auto w-full flex flex-col">
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-foreground flex items-center gap-4">
              환영합니다, {user?.displayName}님 <Sparkles className="w-8 h-8 text-primary animate-pulse" />
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl leading-relaxed">
              사내 인트라넷 대시보드에 오신 것을 환영합니다. 곧 다양한 업무 지원 도구들이 이곳에 추가될 예정입니다.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-card/30 border border-white/5 rounded-3xl shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center text-center p-8">
              <div className="w-24 h-24 mb-8 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-2xl animate-pulse" />
                <Wrench className="w-10 h-10 text-primary relative z-10" />
              </div>
              
              <h2 className="text-3xl font-display font-bold text-foreground mb-4">툴 준비 중</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8 text-lg">
                직원 여러분의 효율적인 업무를 위한 유용한 도구들을 열심히 개발하고 있습니다. 조금만 기다려주세요.
              </p>

              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-muted-foreground">
                <Clock className="w-4 h-4 text-primary" />
                <span>업데이트 예정</span>
              </div>
            </div>
          </motion.div>

          {/* Feature Teasers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            {[
              { title: "인사 관리", desc: "휴가 신청 및 근태 현황을 한눈에 확인하세요." },
              { title: "프로젝트 트래커", desc: "진행 중인 프로젝트의 상태를 추적하고 공유합니다." },
              { title: "사내 공지", desc: "중요한 회사 소식을 가장 먼저 받아보세요." }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + (i * 0.1) }}
                className="group p-6 rounded-2xl bg-card border border-white/5 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 cursor-default"
              >
                <h3 className="text-lg font-bold text-foreground mb-2 flex items-center justify-between">
                  {feature.title}
                  <ArrowRight className="w-4 h-4 text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </motion.div>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}
