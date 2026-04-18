"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight, Target, Sparkles, BookOpen, MessageCircle,
  CheckCircle, Zap, Shield, Clock, Star, Check, ChevronDown,
  PenTool, BarChart3, Users, FileText, LayoutDashboard,
  Mail, Eye, EyeOff, X, Loader2,
} from "lucide-react";

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

function useGoogleLogin() {
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/onboarding` }
    });
    if (error) console.error('Login error:', error.message);
  };
  return handleLogin;
}

// ═══════════════════════════════════════
// NEW: AUTH MODAL (Email + Google)
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
  const handleGoogle = useGoogleLogin();

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
        // Supabase может требовать подтверждение email
        // Если confirmations OFF — сразу редиректим
        if (data.session) {
          router.push('/onboarding');
        } else {
          setSuccess('Проверьте почту — мы отправили ссылку для подтверждения');
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
        // Check if has profile
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
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="w-6 h-6 text-brand-accent" />
              <span className="text-xl font-bold text-brand-text">PsyContent</span>
            </div>
            <h3 className="text-lg font-bold text-brand-text">
              {mode === 'register' ? 'Создайте аккаунт' : 'Войдите в аккаунт'}
            </h3>
            <p className="text-sm text-brand-text-secondary mt-1">
              {mode === 'register'
                ? 'Бесплатно. Без карты. За 5 минут.'
                : 'Рады вас снова видеть!'}
            </p>
          </div>

          {/* Google Button */}
          <button
            onClick={() => { handleGoogle(); onClose(); }}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-brand-border hover:bg-gray-50 transition font-medium text-brand-text text-sm cursor-pointer mb-4"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Продолжить с Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-brand-border" />
            <span className="text-xs text-brand-text-secondary">или по email</span>
            <div className="flex-1 h-px bg-brand-border" />
          </div>

          {/* Email Form */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-border text-sm focus:border-brand-accent focus:outline-none transition"
                />
              </div>
            </div>
            <div>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-12 py-3 rounded-xl border border-brand-border text-sm focus:border-brand-accent focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-xs bg-red-50 p-2 rounded-lg">{error}</p>
            )}
            {success && (
              <p className="text-green-600 text-xs bg-green-50 p-2 rounded-lg">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-accent text-white rounded-xl font-semibold text-sm hover:bg-brand-accent-hover transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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

          <p className="text-center text-xs text-brand-text-secondary mt-4">
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
// NAVBAR (updated to use modal)
// ═══════════════════════════════════════

function Navbar() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuth, setShowAuth] = useState(false); // NEW

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
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-brand-accent" />
            <span className="text-xl font-bold text-brand-text">PsyContent</span>
          </div>
          {isLoggedIn ? (
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 bg-brand-accent text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-brand-accent-hover transition cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4" />
              Мой кабинет
            </button>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="bg-brand-accent text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-brand-accent-hover transition cursor-pointer"
            >
              Начать бесплатно
            </button>
          )}
        </div>
      </nav>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}

// ═══════════════════════════════════════
// HERO (updated to use modal)
// ═══════════════════════════════════════

function Hero() {
  const [showAuth, setShowAuth] = useState(false); // NEW

  return (
    <>
      <section className="pt-32 pb-20 px-6">
        <motion.div className="max-w-4xl mx-auto text-center" initial="hidden" animate="visible" variants={stagger}>
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-brand-highlight text-brand-accent px-4 py-2 rounded-full text-sm font-medium mb-8">
            <Sparkles className="w-4 h-4" /> Для психологов, которые не хотят танцевать в рилс
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-4xl md:text-6xl font-extrabold text-brand-text leading-tight mb-6">
            Вы помогаете людям найти себя.{" "}
            <span className="text-brand-accent">Мы поможем людям найти вас.</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="text-lg md:text-xl text-brand-text-secondary max-w-2xl mx-auto mb-10">
            PsyContent берёт ваш опыт, ваш подход, ваш голос — и превращает в контент, который привлекает клиентов. Без фальши. Без плясок.
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => setShowAuth(true)}
              className="inline-flex items-center gap-2 bg-brand-accent text-white px-8 py-4 rounded-full text-lg font-semibold hover:bg-brand-accent-hover transition shadow-lg shadow-brand-accent/25 cursor-pointer"
            >
              Начать бесплатно <ArrowRight className="w-5 h-5" />
            </button>
            <a href="#how" className="text-brand-text-secondary hover:text-brand-text transition text-sm flex items-center gap-1">
              Как это работает? <ChevronDown className="w-4 h-4" />
            </a>
          </motion.div>
          <motion.div variants={fadeUp} className="flex items-center justify-center gap-6 mt-8 text-brand-text-secondary text-sm">
            <span className="flex items-center gap-1"><Shield className="w-4 h-4" /> Без карты</span>
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> 5 минут на старт</span>
            <span className="flex items-center gap-1"><Star className="w-4 h-4" /> Бесплатный план</span>
          </motion.div>
        </motion.div>
      </section>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}

// ═══════════════════════════════════════
// REST OF COMPONENTS (unchanged)
// ═══════════════════════════════════════

const pains = [
  { icon: Clock, title: "Нет времени на контент", desc: "Между сессиями, обучением и личной жизнью — блог всегда в конце списка." },
  { icon: PenTool, title: "Не знаю что писать", desc: "Идеи заканчиваются, а «экспертный контент» звучит как из учебника." },
  { icon: Users, title: "Стесняюсь себя продвигать", desc: "Продажи ощущаются как что-то неэтичное. Хочется привлекать, а не навязывать." },
  { icon: BarChart3, title: "Посты не приводят клиентов", desc: "Пишете, стараетесь — а заявок всё равно нет. Непонятно что работает." },
];

function Pains() {
  return (
    <section className="py-20 px-6 bg-white">
      <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-brand-text mb-4">Знакомо?</motion.h2>
        <motion.p variants={fadeUp} className="text-center text-brand-text-secondary mb-12">Большинство психологов сталкиваются с этим каждый день</motion.p>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pains.map((pain, i) => (
            <motion.div key={i} variants={fadeUp} className="p-6 rounded-2xl border border-brand-border hover:border-brand-accent/30 transition bg-brand-bg">
              <pain.icon className="w-10 h-10 text-brand-accent mb-4" />
              <h3 className="font-bold text-brand-text mb-2">{pain.title}</h3>
              <p className="text-sm text-brand-text-secondary leading-relaxed">{pain.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

function Solution() {
  return (
    <section className="py-20 px-6">
      <motion.div className="max-w-4xl mx-auto text-center" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-brand-text mb-6">
          PsyContent — как ассистент,<br />который понимает психологию
        </motion.h2>
        <motion.p variants={fadeUp} className="text-lg text-brand-text-secondary max-w-2xl mx-auto mb-8">
          Это не просто &laquo;генератор текстов&raquo;. Мы сначала изучаем ваш подход, вашу нишу, ваш тон — и только потом создаём контент, который звучит как вы.
        </motion.p>
        <motion.div variants={fadeUp} className="grid sm:grid-cols-3 gap-6 text-left">
          {[
            { icon: Target, title: "Ваш голос", desc: "Распаковка вашего стиля, подхода и уникальности" },
            { icon: FileText, title: "Ваш контент", desc: "Посты, рилс, сторис — в вашем тоне, на ваши темы" },
            { icon: BarChart3, title: "Ваши клиенты", desc: "Контент-стратегия, которая приводит заявки" },
          ].map((item, i) => (
            <div key={i} className="p-6 rounded-2xl bg-white border border-brand-border">
              <item.icon className="w-8 h-8 text-brand-accent mb-3" />
              <h3 className="font-bold text-brand-text mb-1">{item.title}</h3>
              <p className="text-sm text-brand-text-secondary">{item.desc}</p>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

const steps = [
  { num: "01", icon: MessageCircle, title: "Распаковка", desc: "Ответьте на вопросы о вашем подходе, нише и клиентах. 5 минут — и мы знаем ваш голос.", color: "bg-purple-100 text-purple-600" },
  { num: "02", icon: BookOpen, title: "Паспорт бренда", desc: "Получите документ с вашим позиционированием, тоном и ключевыми темами.", color: "bg-blue-100 text-blue-600" },
  { num: "03", icon: Sparkles, title: "Контент", desc: "Генерируйте посты, рилс-скрипты и сторис одной кнопкой. В вашем стиле.", color: "bg-green-100 text-green-600" },
  { num: "04", icon: Target, title: "Клиенты", desc: "Публикуйте, привлекайте аудиторию и получайте заявки на терапию.", color: "bg-orange-100 text-orange-600" },
];

function HowItWorks() {
  return (
    <section id="how" className="py-20 px-6 bg-white">
      <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-brand-text mb-4">Как это работает</motion.h2>
        <motion.p variants={fadeUp} className="text-center text-brand-text-secondary mb-12">От регистрации до первого поста — 10 минут</motion.p>
        <div className="grid md:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <motion.div key={i} variants={fadeUp} className="relative p-6 rounded-2xl border border-brand-border bg-brand-bg">
              <div className={`w-12 h-12 rounded-xl ${step.color} flex items-center justify-center mb-4`}>
                <step.icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-brand-accent">ШАГ {step.num}</span>
              <h3 className="font-bold text-brand-text mt-1 mb-2">{step.title}</h3>
              <p className="text-sm text-brand-text-secondary leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

const features = [
  { icon: Sparkles, title: "Посты в вашем голосе", desc: "Не шаблонные тексты, а контент с вашим характером и подходом" },
  { icon: FileText, title: "Рилс без танцев", desc: "Скрипты для рилс где вы говорите, а не танцуете" },
  { icon: BookOpen, title: "База знаний", desc: "Уроки по контенту, продвижению и привлечению клиентов" },
  { icon: Target, title: "Контент-план", desc: "Готовый план на 30 дней — не нужно думать что постить" },
  { icon: MessageCircle, title: "Telegram-напоминания", desc: "Бот напомнит когда пора писать и предложит тему" },
  { icon: CheckCircle, title: "Промпты и инструкции", desc: "Готовые промпты для любой задачи — от поста до сторис" },
];

function Features() {
  return (
    <section className="py-20 px-6">
      <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-brand-text mb-12">Всё что нужно для блога</motion.h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div key={i} variants={fadeUp} className="p-6 rounded-2xl bg-white border border-brand-border hover:shadow-md transition">
              <feature.icon className="w-8 h-8 text-brand-accent mb-4" />
              <h3 className="font-bold text-brand-text mb-2">{feature.title}</h3>
              <p className="text-sm text-brand-text-secondary leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

const audiences = [
  { title: "Начинающие психологи", desc: "Только получили образование и хотят набрать первых клиентов через блог", icon: "🌱" },
  { title: "Практикующие терапевты", desc: "Уже ведут практику, но хотят больше клиентов из соцсетей", icon: "🎯" },
  { title: "Психологи в нише", desc: "Работают с конкретной темой (тревога, отношения, травма) и хотят быть узнаваемыми", icon: "💎" },
];

function ForWhom() {
  return (
    <section className="py-20 px-6 bg-white">
      <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-brand-text mb-12">Для кого PsyContent</motion.h2>
        <div className="grid md:grid-cols-3 gap-6">
          {audiences.map((a, i) => (
            <motion.div key={i} variants={fadeUp} className="p-6 rounded-2xl border border-brand-border bg-brand-bg text-center">
              <div className="text-4xl mb-4">{a.icon}</div>
              <h3 className="font-bold text-brand-text mb-2">{a.title}</h3>
              <p className="text-sm text-brand-text-secondary leading-relaxed">{a.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

const testimonials = [
  { text: "Я гештальт-терапевт и думала что блог — не моё. PsyContent помог найти свой тон. Через месяц — 4 новых клиента из Instagram.", name: "Анна К.", role: "Гештальт-терапевт, Москва" },
  { text: "Раньше тратила 3 часа на пост. Сейчас — 20 минут. И посты стали лучше, потому что сервис знает мой стиль.", name: "Мария С.", role: "КПТ-терапевт, Санкт-Петербург" },
  { text: "Наконец-то сервис, который понимает специфику психологии. Не инфоцыганский подход, а уважительно и профессионально.", name: "Дмитрий Л.", role: "Клинический психолог, Казань" },
];

function Testimonials() {
  return (
    <section className="py-20 px-6">
      <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-brand-text mb-12">Психологи уже используют PsyContent</motion.h2>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div key={i} variants={fadeUp} className="p-6 rounded-2xl bg-white border border-brand-border">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-brand-accent text-brand-accent" />
                ))}
              </div>
              <p className="text-brand-text text-sm leading-relaxed mb-4 italic">&ldquo;{t.text}&rdquo;</p>
              <p className="font-semibold text-brand-text text-sm">{t.name}</p>
              <p className="text-brand-text-secondary text-xs">{t.role}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

const plans = [
  {
    name: "Старт", price: "Бесплатно", period: "",
    description: "Попробовать и понять свой бренд",
    features: ["Распаковка + Паспорт бренда", "3 поста в месяц", "2 урока из базы знаний"],
    cta: "Начать бесплатно", popular: false,
  },
  {
    name: "Рост", price: "990 ₽", period: "/мес",
    description: "Системное ведение блога",
    features: ["Всё из тарифа Старт", "20 постов в месяц", "Контент-план на 30 дней", "5 рилс-скриптов", "Все промпты и инструкции", "Telegram-напоминания", "Вся база знаний"],
    cta: "Выбрать Рост", popular: true,
  },
  {
    name: "Практика", price: "2 490 ₽", period: "/мес",
    description: "Полный набор для роста практики",
    features: ["Всё из тарифа Рост", "Безлимит постов", "Безлимит рилс-скриптов", "Переписывание текстов", "Портфолио отзывов", "Приоритетная поддержка"],
    cta: "Выбрать Практику", popular: false,
  },
];

function Pricing() {
  const [showAuth, setShowAuth] = useState(false); // NEW: modal instead of direct Google
  return (
    <>
      <section id="pricing" className="py-20 px-6 bg-white">
        <motion.div className="max-w-6xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
          <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-brand-text mb-4">Начните бесплатно, растите с нами</motion.h2>
          <motion.p variants={fadeUp} className="text-center text-brand-text-secondary mb-12">Один клиент из блога окупает подписку на год</motion.p>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {plans.map((plan, i) => (
              <motion.div key={i} variants={fadeUp} className={`relative p-6 rounded-2xl border ${plan.popular ? "border-brand-accent shadow-lg shadow-brand-accent/10 scale-105" : "border-brand-border"} bg-brand-bg`}>
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-accent text-white text-xs font-semibold px-3 py-1 rounded-full">Популярный</span>
                )}
                <h3 className="text-lg font-bold text-brand-text">{plan.name}</h3>
                <p className="text-brand-text-secondary text-sm mt-1 mb-4">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-3xl font-extrabold text-brand-text">{plan.price}</span>
                  <span className="text-brand-text-secondary text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-brand-text">
                      <Check className="w-4 h-4 text-brand-accent mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setShowAuth(true)}
                  className={`block w-full text-center py-3 rounded-full font-semibold text-sm transition cursor-pointer ${plan.popular ? "bg-brand-accent text-white hover:bg-brand-accent-hover" : "bg-white border border-brand-border text-brand-text hover:border-brand-accent"}`}
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

const faqs = [
  { q: "Это не будет звучать как ChatGPT?", a: "Нет. Мы сначала изучаем ваш тон, подход, язык через распаковку. Каждый пост — в вашем стиле, не в стиле робота." },
  { q: "Я только начинаю, подойдёт ли мне?", a: "Идеально подойдёт. Бесплатный тариф даёт распаковку и паспорт бренда — то что нужно на старте." },
  { q: "А если у меня нет Instagram?", a: "Контент подходит для любой площадки: Telegram, VK, сайт, YouTube. Мы создаём тексты, а не привязываемся к платформе." },
  { q: "Чем это лучше обычного ChatGPT?", a: "ChatGPT не знает вашу нишу, тон, клиента. PsyContent заточен под психологов: знает этику, специфику, что работает в этой сфере." },
  { q: "Могу ли я отменить подписку?", a: "Да, в любой момент. Без вопросов, без удержаний. Всё что вы создали — остаётся у вас." },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="py-20 px-6">
      <motion.div className="max-w-3xl mx-auto" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
        <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-brand-text mb-12">Частые вопросы</motion.h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div key={i} variants={fadeUp} className="border border-brand-border rounded-xl overflow-hidden">
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between p-5 text-left cursor-pointer">
                <span className="font-semibold text-brand-text text-sm">{faq.q}</span>
                <ChevronDown className={`w-5 h-5 text-brand-text-secondary transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && (
                <div className="px-5 pb-5">
                  <p className="text-brand-text-secondary text-sm leading-relaxed">{faq.a}</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

function CTA() {
  const [showAuth, setShowAuth] = useState(false); // NEW
  return (
    <>
      <section id="cta" className="py-20 px-6 bg-brand-accent">
        <motion.div className="max-w-3xl mx-auto text-center" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
          <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-white mb-6">
            Хватит откладывать свой блог
          </motion.h2>
          <motion.p variants={fadeUp} className="text-lg text-white/80 mb-8">
            5 минут на распаковку — и вы получите стратегию, которая приведёт клиентов. Бесплатно.
          </motion.p>
          <motion.button
            variants={fadeUp}
            onClick={() => setShowAuth(true)}
            className="inline-flex items-center gap-2 bg-white text-brand-accent px-8 py-4 rounded-full text-lg font-semibold hover:bg-gray-100 transition shadow-lg cursor-pointer"
          >
            Начать бесплатно <ArrowRight className="w-5 h-5" />
          </motion.button>
          <motion.div variants={fadeUp} className="flex items-center justify-center gap-6 mt-6 text-white/60 text-sm">
            <span className="flex items-center gap-1"><Shield className="w-4 h-4" /> Без карты</span>
            <span className="flex items-center gap-1"><Zap className="w-4 h-4" /> За 5 минут</span>
            <span className="flex items-center gap-1"><Star className="w-4 h-4" /> Бесплатно</span>
          </motion.div>
        </motion.div>
      </section>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}

function Footer() {
  return (
    <footer className="py-12 px-6 bg-brand-text">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-brand-accent" />
          <span className="text-white font-bold">PsyContent</span>
        </div>
        <p className="text-gray-400 text-sm">&copy; 2025 PsyContent. Сделано для психологов с заботой.</p>
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
