"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import {
  ArrowRight, Target, BookOpen, MessageCircle,
  CheckCircle, Zap, Shield, Clock, Star, Check, ChevronDown,
  PenTool, BarChart3, Users, FileText, LayoutDashboard,
  Mail, Eye, EyeOff, X, Loader2,
} from "lucide-react";
import Squiggle from "@/components/Squiggle";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};
const stagger = {
  visible: { transition: { staggerChildren: 0.15 } },
};

// ═══════════════════════════════════════
// AUTH HOOKS
// ═══════════════════════════════════════

function useAuthState() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('onboarding_profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .single();
      if (profile) {
        router.push('/dashboard');
      } else {
        setIsLoggedIn(true);
      }
    };
    checkSession();
  }, [router]);

  return isLoggedIn;
}

// ═══════════════════════════════════════
// AUTH MODAL (Email)
// ═══════════════════════════════════════

function AuthModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (password.length < 6) {
      setError('Пароль должен быть минимум 6 символов');
      setLoading(false);
      return;
    }

    if (mode === 'register') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/onboarding` }
      });
      if (signUpError) {
        setError(signUpError.message === 'User already registered'
          ? 'Этот email уже зарегистрирован. Попробуйте войти.'
          : signUpError.message);
      } else if (data.user) {
        if (data.session) {
          router.push('/onboarding');
        } else {
          setSuccess('Проверьте почту, мы отправили ссылку для подтверждения');
        }
      }
    } else {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message === 'Invalid login credentials'
          ? 'Неверный email или пароль'
          : signInError.message);
      } else if (data.user) {
        const { data: profile } = await supabase
          .from('onboarding_profiles')
          .select('user_id')
          .eq('user_id', data.user.id)
          .single();
        router.push(profile ? '/dashboard' : '/onboarding');
      }
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(46,42,69,0.45)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-brand-card rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 w-full sm:max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto border border-brand-border"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-brand-muted hover:text-brand-text transition cursor-pointer p-1"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Мобильная ручка для свайпа */}
          <div className="sm:hidden flex justify-center mb-3">
            <div className="w-10 h-1 bg-brand-border rounded-full" />
          </div>

          <div className="text-center mb-6">
            <div className="flex items-center justify-center mb-3">
              <Image
                src="/logo/out_wordmark.svg"
                alt="PsyCont"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-brand-text">
              {mode === 'register' ? 'Создайте аккаунт' : 'Войдите в аккаунт'}
            </h3>
            <p className="text-sm text-brand-muted mt-1">
              {mode === 'register'
                ? 'Бесплатно. Без карты.'
                : 'Рады снова видеть вас!'}
            </p>
          </div>

          {/* Yandex Button */}
          <a
            href="/auth/yandex/start"
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-brand-border hover:bg-brand-bg transition font-medium text-brand-text text-sm cursor-pointer mb-4 active:scale-[0.98]"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="12" fill="#FC3F1D" />
              <path fill="#fff" d="M13.3 6.4h-1.2c-2.2 0-3.4 1.1-3.4 2.8 0 1.4.6 2.2 1.9 3.1l1 .7-2.9 4.3h1.8l3-4.5V6.4h-.2zm-.6 5.4l-.9-.5c-.9-.6-1.3-1-1.3-2 0-.9.6-1.5 1.8-1.5h.6v4z" />
            </svg>
            Войти через Яндекс
          </a>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-brand-border" />
            <span className="text-xs text-brand-muted">или по email</span>
            <div className="flex-1 h-px bg-brand-border" />
          </div>

          {/* Email Form, font-size: 16px чтобы iOS не зумил */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input pl-10"
              />
            </div>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input pl-10 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text cursor-pointer p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-brand-text text-xs bg-brand-soft p-2.5 rounded-xl border border-brand-border-soft">{error}</p>
            )}
            {success && (
              <p className="text-brand-text text-xs bg-brand-soft p-2.5 rounded-xl border border-brand-border-soft">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-sm disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</>
              ) : mode === 'register' ? (
                'Создать аккаунт'
              ) : (
                'Войти'
              )}
            </button>
          </form>

          <p className="text-center text-xs text-brand-muted mt-4">
            {mode === 'register' ? (
              <>Уже есть аккаунт?{' '}
                <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }} className="text-brand-accent font-medium hover:underline cursor-pointer">
                  Войти
                </button>
              </>
            ) : (
              <>Нет аккаунта?{' '}
                <button onClick={() => { setMode('register'); setError(''); setSuccess(''); }} className="text-brand-accent font-medium hover:underline cursor-pointer">
                  Зарегистрироваться
                </button>
              </>
            )}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════
// NAVBAR
// ═══════════════════════════════════════

function Navbar() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('onboarding_profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .single();
      if (data) setIsLoggedIn(true);
    };
    check();
  }, []);

  return (
    <>
      <nav className="fixed top-0 w-full z-50 bg-brand-bg/90 backdrop-blur border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <Image
            src="/logo/out_wordmark.svg"
            alt="PsyCont"
            width={110}
            height={28}
            className="h-7 w-auto"
          />
          {isLoggedIn ? (
            <button
              onClick={() => router.push('/dashboard')}
              className="btn-primary py-2 px-4 sm:px-5 text-sm"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Мой кабинет</span>
              <span className="sm:hidden">Кабинет</span>
            </button>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="btn-primary py-2 px-4 sm:px-5 text-sm"
            >
              <span className="hidden sm:inline">Начать бесплатно</span>
              <span className="sm:hidden">Начать</span>
            </button>
          )}
        </div>
      </nav>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}

// ═══════════════════════════════════════
// HERO
// ═══════════════════════════════════════

function Hero() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-20 px-4 sm:px-6">
        <motion.div className="max-w-4xl mx-auto text-center" initial="hidden" animate="visible" variants={stagger}>
          {/* Бейдж */}
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-brand-soft text-brand-accent px-3 sm:px-4 py-2 rounded-2xl text-xs sm:text-sm font-medium mb-6 sm:mb-8">
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-sage shrink-0" />
            <span className="hidden sm:inline">Для психологов, которые хотят клиентов из блога</span>
            <span className="sm:hidden">Для психологов</span>
          </motion.div>

          {/* Заголовок */}
          <motion.div variants={fadeUp} className="mb-4 sm:mb-6">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-brand-text leading-tight">
              Вы помогаете людям найти себя.{" "}
              <span className="text-brand-accent">Мы поможем людям найти вас.</span>
            </h1>
            <div className="flex justify-start">
              <Squiggle variant={0} width="55%" className="mt-3" />
            </div>
          </motion.div>

          <motion.p variants={fadeUp} className="text-base sm:text-lg md:text-xl text-brand-muted max-w-2xl mx-auto mb-8 sm:mb-10">
            PsyCont учится на вашем голосе и пишет контент, который звучит как вы, не как нейросеть. Потому что именно это приводит клиентов.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <button
              onClick={() => setShowAuth(true)}
              className="btn-primary w-full sm:w-auto px-8 py-4 text-base sm:text-lg shadow-lg shadow-brand-accent/20"
            >
              Начать бесплатно <ArrowRight className="w-5 h-5" />
            </button>
            <a href="#how" className="text-brand-muted hover:text-brand-text transition text-sm flex items-center gap-1 py-2">
              Как это работает? <ChevronDown className="w-4 h-4" />
            </a>
          </motion.div>

          {/* Бенефиты */}
          <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-6 sm:mt-8 text-brand-muted text-xs sm:text-sm">
            <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-sage" /> Без карты</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-sage" /> 5 минут на старт</span>
            <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-sage" /> Бесплатный план</span>
          </motion.div>
        </motion.div>
      </section>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}

// ═══════════════════════════════════════
// PAINS
// ═══════════════════════════════════════

const pains = [
  { icon: Clock, title: "Нет времени на контент", desc: "Между сессиями, обучением и личной жизнью, блог всегда в конце списка." },
  { icon: PenTool, title: "Не знаю что писать", desc: "Идеи заканчиваются, а «экспертный контент» звучит как из учебника." },
  { icon: Users, title: "Стесняюсь себя продвигать", desc: "Продажи ощущаются как что-то неэтичное. Хочется привлекать, а не навязывать." },
  { icon: BarChart3, title: "Посты не приводят клиентов", desc: "Пишете, стараетесь, а заявок всё равно нет. Непонятно что работает." },
];

function Pains() {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 bg-brand-card">
      <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-brand-text mb-3 sm:mb-4">Знакомо?</motion.h2>
        <motion.p variants={fadeUp} className="text-center text-brand-muted text-sm sm:text-base mb-8 sm:mb-12">Большинство психологов сталкиваются с этим каждый день</motion.p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {pains.map((pain, i) => (
            <motion.div key={i} variants={fadeUp} className="p-4 sm:p-6 rounded-3xl border border-brand-border hover:border-brand-accent/30 transition bg-brand-bg">
              <pain.icon className="w-8 h-8 sm:w-10 sm:h-10 text-brand-accent mb-3 sm:mb-4" />
              <h3 className="font-bold text-brand-text mb-1 sm:mb-2 text-sm sm:text-base">{pain.title}</h3>
              <p className="text-xs sm:text-sm text-brand-muted leading-relaxed">{pain.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════
// SOLUTION
// ═══════════════════════════════════════

function Solution() {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6">
      <motion.div className="max-w-4xl mx-auto text-center" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-text mb-4 sm:mb-6">
          PsyCont, как ассистент,{" "}
          <span className="sm:block">который понимает психологию</span>
        </motion.h2>
        <motion.p variants={fadeUp} className="text-base sm:text-lg text-brand-muted max-w-2xl mx-auto mb-6 sm:mb-8">
          Это не просто &laquo;генератор текстов&raquo;. Мы сначала изучаем ваш подход, вашу нишу, ваш тон, и только потом создаём контент, который звучит как вы.
        </motion.p>
        <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-left">
          {[
            { icon: Target, title: "Ваш голос", desc: "Распаковка вашего стиля, подхода и уникальности" },
            { icon: FileText, title: "Ваш контент", desc: "Посты, рилс, сторис, в вашем тоне, на ваши темы" },
            { icon: BarChart3, title: "Ваши клиенты", desc: "Контент-стратегия, которая приводит заявки" },
          ].map((item, i) => (
            <div key={i} className="card">
              <item.icon className="w-7 h-7 sm:w-8 sm:h-8 text-brand-accent mb-2 sm:mb-3" />
              <h3 className="font-bold text-brand-text mb-1 text-sm sm:text-base">{item.title}</h3>
              <p className="text-xs sm:text-sm text-brand-muted">{item.desc}</p>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════
// HOW IT WORKS
// ═══════════════════════════════════════

const steps = [
  { num: "01", icon: MessageCircle, title: "Распаковка", desc: "Ответьте на вопросы о вашем подходе, нише и клиентах. 5 минут, и мы знаем ваш голос." },
  { num: "02", icon: BookOpen, title: "Паспорт бренда", desc: "Получите документ с вашим позиционированием, тоном и ключевыми темами." },
  { num: "03", icon: PenTool, title: "Контент", desc: "Генерируйте посты, рилс-скрипты и сторис одной кнопкой. В вашем стиле." },
  { num: "04", icon: Target, title: "Клиенты", desc: "Публикуйте, привлекайте аудиторию и получайте заявки на терапию." },
];

function HowItWorks() {
  return (
    <section id="how" className="py-12 sm:py-20 px-4 sm:px-6 bg-brand-card">
      <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-brand-text mb-3 sm:mb-4">Как это работает</motion.h2>
        <motion.p variants={fadeUp} className="text-center text-brand-muted text-sm sm:text-base mb-8 sm:mb-12">От регистрации до первого поста, 10 минут</motion.p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
          {steps.map((step, i) => (
            <motion.div key={i} variants={fadeUp} className="relative p-4 sm:p-6 rounded-3xl border border-brand-border bg-brand-bg">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-brand-soft flex items-center justify-center mb-3 sm:mb-4">
                <step.icon className="w-5 h-5 sm:w-6 sm:h-6 text-brand-accent" />
              </div>
              <span className="text-[10px] sm:text-xs font-bold text-brand-accent">ШАГ {step.num}</span>
              <h3 className="font-bold text-brand-text mt-1 mb-1 sm:mb-2 text-xs sm:text-base">{step.title}</h3>
              <p className="text-[11px] sm:text-sm text-brand-muted leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════
// FEATURES
// ═══════════════════════════════════════

const features = [
  { icon: PenTool, title: "Посты в вашем голосе", desc: "Не шаблонные тексты, а контент с вашим характером и подходом" },
  { icon: FileText, title: "Рилс без танцев", desc: "Скрипты для рилс где вы говорите, а не танцуете" },
  { icon: BookOpen, title: "База знаний", desc: "Уроки по контенту, продвижению и привлечению клиентов" },
  { icon: Target, title: "Контент-план", desc: "Готовый план на 30 дней, не нужно думать что постить" },
  { icon: MessageCircle, title: "Telegram-напоминания", desc: "Бот напомнит когда пора писать и предложит тему" },
  { icon: CheckCircle, title: "Промпты и инструкции", desc: "Готовые промпты для любой задачи, от поста до сторис" },
];

function Features() {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6">
      <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-brand-text mb-8 sm:mb-12">Всё что нужно для блога</motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {features.map((feature, i) => (
            <motion.div key={i} variants={fadeUp} className="card hover:shadow-md transition">
              <feature.icon className="w-7 h-7 sm:w-8 sm:h-8 text-brand-accent mb-3 sm:mb-4" />
              <h3 className="font-bold text-brand-text mb-1 sm:mb-2 text-sm sm:text-base">{feature.title}</h3>
              <p className="text-xs sm:text-sm text-brand-muted leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════
// FOR WHOM
// ═══════════════════════════════════════

const audiences = [
  { title: "Начинающие психологи", desc: "Только получили образование и хотят набрать первых клиентов через блог" },
  { title: "Практикующие терапевты", desc: "Уже ведут практику, но хотят больше клиентов из соцсетей" },
  { title: "Психологи в нише", desc: "Работают с конкретной темой (тревога, отношения, травма) и хотят быть узнаваемыми" },
];

function ForWhom() {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 bg-brand-card">
      <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-brand-text mb-8 sm:mb-12">Для кого PsyCont</motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {audiences.map((a, i) => (
            <motion.div key={i} variants={fadeUp} className="p-4 sm:p-6 rounded-3xl border border-brand-border bg-brand-bg text-center">
              <div className="w-10 h-10 rounded-2xl bg-brand-soft flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Users className="w-5 h-5 text-brand-accent" />
              </div>
              <h3 className="font-bold text-brand-text mb-1 sm:mb-2 text-sm sm:text-base">{a.title}</h3>
              <p className="text-xs sm:text-sm text-brand-muted leading-relaxed">{a.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════
// TESTIMONIALS
// ═══════════════════════════════════════

const testimonials = [
  { text: "Я гештальт-терапевт и думала что блог, не моё. PsyCont помог найти свой тон. Через месяц, 4 новых клиента из Instagram.", name: "Анна К.", role: "Гештальт-терапевт, Москва" },
  { text: "Раньше тратила 3 часа на пост. Сейчас, 20 минут. И посты стали лучше, потому что сервис знает мой стиль.", name: "Мария С.", role: "КПТ-терапевт, Санкт-Петербург" },
  { text: "Наконец-то сервис, который понимает специфику психологии. Не инфоцыганский подход, а уважительно и профессионально.", name: "Дмитрий Л.", role: "Клинический психолог, Казань" },
];

function Testimonials() {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6">
      <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-brand-text mb-8 sm:mb-12">Психологи уже используют PsyCont</motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {testimonials.map((t, i) => (
            <motion.div key={i} variants={fadeUp} className="card">
              <div className="flex gap-1 mb-3 sm:mb-4">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-brand-sage text-brand-sage" />
                ))}
              </div>
              <p className="text-brand-text text-xs sm:text-sm leading-relaxed mb-3 sm:mb-4 italic">&ldquo;{t.text}&rdquo;</p>
              <p className="font-semibold text-brand-text text-sm">{t.name}</p>
              <p className="text-brand-muted text-xs">{t.role}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════
// PRICING
// ═══════════════════════════════════════

const plans = [
  {
    name: "Старт", price: "Бесплатно", period: "",
    description: "Попробовать и понять свой бренд",
    features: ["Распаковка + Паспорт бренда", "3 поста в месяц", "2 урока из базы знаний"],
    cta: "Начать бесплатно", popular: false,
  },
  {
    name: "Блог", price: "990 ₽", period: "/мес",
    description: "Системное ведение блога",
    features: ["Всё из тарифа Старт", "Текст безлимит", "Контент-план на 30 дней", "5 рилс-скриптов", "Все промпты и инструкции", "Telegram-напоминания", "Вся база знаний"],
    cta: "Выбрать Блог", popular: true,
  },
  {
    name: "Практика", price: "2 490 ₽", period: "/мес",
    description: "Полный набор для роста практики",
    features: ["Всё из тарифа Блог", "Анализ конкурентов", "Портфолио отзывов", "Приоритетная поддержка"],
    cta: "Выбрать Практику", popular: false,
  },
];

function Pricing() {
  const [showAuth, setShowAuth] = useState(false);
  return (
    <>
      <section id="pricing" className="py-12 sm:py-20 px-4 sm:px-6 bg-brand-card">
        <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
          <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-brand-text mb-3 sm:mb-4">Начните бесплатно</motion.h2>
          <motion.p variants={fadeUp} className="text-center text-brand-muted text-sm sm:text-base mb-8 sm:mb-12">Один клиент из блога окупает подписку на год</motion.p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {plans.map((plan, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className={`relative p-4 sm:p-6 rounded-3xl border bg-brand-bg ${
                  plan.popular
                    ? "border-brand-accent shadow-lg shadow-brand-accent/10 md:scale-105"
                    : "border-brand-border"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-accent text-white text-xs font-semibold px-3 py-1 rounded-2xl whitespace-nowrap">Популярный</span>
                )}
                <h3 className="text-base sm:text-lg font-bold text-brand-text">{plan.name}</h3>
                <p className="text-brand-muted text-xs sm:text-sm mt-1 mb-3 sm:mb-4">{plan.description}</p>
                <div className="mb-4 sm:mb-6">
                  <span className="text-2xl sm:text-3xl font-bold text-brand-text">{plan.price}</span>
                  <span className="text-brand-muted text-xs sm:text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs sm:text-sm text-brand-text">
                      <Check className="w-4 h-4 text-brand-sage mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setShowAuth(true)}
                  className={`block w-full text-center py-2.5 sm:py-3 rounded-2xl font-semibold text-sm transition cursor-pointer active:scale-[0.97] ${
                    plan.popular
                      ? "bg-brand-accent text-white hover:bg-brand-accent-hover"
                      : "bg-brand-card border border-brand-border text-brand-text hover:border-brand-accent"
                  }`}
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}

// ═══════════════════════════════════════
// FAQ
// ═══════════════════════════════════════

const faqs = [
  { q: "Это не будет звучать как ChatGPT?", a: "Нет. Мы сначала изучаем ваш тон, подход, язык через распаковку. Каждый пост, в вашем стиле, не в стиле робота." },
  { q: "Я только начинаю, подойдёт ли мне?", a: "Идеально подойдёт. Бесплатный тариф даёт распаковку и паспорт бренда, то что нужно на старте." },
  { q: "А если у меня нет Instagram?", a: "Контент подходит для любой площадки: Telegram, VK, сайт, YouTube. Мы создаём тексты, а не привязываемся к платформе." },
  { q: "Чем это лучше обычного ChatGPT?", a: "ChatGPT не знает вашу нишу, тон, клиента. PsyCont заточен под психологов: знает этику, специфику, что работает в этой сфере." },
  { q: "Могу ли я отменить подписку?", a: "Да, в любой момент. Без вопросов, без удержаний. Всё что вы создали, остаётся у вас." },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6">
      <motion.div className="max-w-3xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-brand-text mb-8 sm:mb-12">Частые вопросы</motion.h2>
        <div className="space-y-2 sm:space-y-3">
          {faqs.map((faq, i) => (
            <motion.div key={i} variants={fadeUp} className="border border-brand-border rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-4 sm:p-5 text-left cursor-pointer gap-3"
              >
                <span className="font-semibold text-brand-text text-xs sm:text-sm">{faq.q}</span>
                <ChevronDown className={`w-4 h-4 sm:w-5 sm:h-5 text-brand-muted transition-transform shrink-0 ${open === i ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                      <p className="text-brand-muted text-xs sm:text-sm leading-relaxed">{faq.a}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════
// CTA
// ═══════════════════════════════════════

function CTA() {
  const [showAuth, setShowAuth] = useState(false);
  return (
    <>
      <section id="cta" className="py-12 sm:py-20 px-4 sm:px-6 bg-brand-accent">
        <motion.div className="max-w-3xl mx-auto text-center" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
          <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 sm:mb-6">
            Попробуйте, за 5 минут
          </motion.h2>
          <motion.p variants={fadeUp} className="text-base sm:text-lg text-white/80 mb-6 sm:mb-8">
            Ответьте на вопросы о своей нише и получите первый пост в вашем голосе. Бесплатно.
          </motion.p>
          <motion.button
            variants={fadeUp}
            onClick={() => setShowAuth(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-brand-accent px-8 py-4 rounded-2xl text-base sm:text-lg font-semibold hover:bg-brand-bg transition shadow-lg cursor-pointer active:scale-[0.97]"
          >
            Начать бесплатно <ArrowRight className="w-5 h-5" />
          </motion.button>
          <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-5 sm:mt-6 text-white/60 text-xs sm:text-sm">
            <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Без карты</span>
            <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> За 5 минут</span>
            <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Бесплатно</span>
          </motion.div>
        </motion.div>
      </section>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}

// ═══════════════════════════════════════
// FOOTER
// ═══════════════════════════════════════

function Footer() {
  return (
    <footer className="py-8 sm:py-12 px-4 sm:px-6 bg-brand-text">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
        <Image
          src="/logo/out_wordmark_dark.svg"
          alt="PsyCont"
          width={100}
          height={26}
          className="h-6 w-auto"
        />
        <p className="text-white/50 text-xs sm:text-sm text-center">&copy; 2025 PsyCont. Сделано для психологов с заботой.</p>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════

export default function Home() {
  useAuthState();

  return (
    <main>
      <Navbar />
      <Hero />
      <Pains />
      <Solution />
      <HowItWorks />
      <Features />
      <ForWhom />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
