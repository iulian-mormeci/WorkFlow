import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Camera,
  CheckCircle2,
  Cloud,
  FileText,
  LayoutTemplate,
  MapPin,
  Package,
  Shield,
  Sparkles,
  Ticket,
  Timer,
  Users,
  Wrench
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "WorkFlow — Interventi sul campo, organizzati",
  description:
    "PWA offline-first per tecnici: interventi, documenti, promemoria, sync multi-dispositivo e report PDF. I tuoi dati restano sul dispositivo e si aggiornano in cloud quando c’è rete."
};

const features = [
  {
    icon: Wrench,
    title: "Interventi e attività",
    body: "Gestisci visite, attività in sede o da remoto, stato lavori, note e allegati in un unico flusso pensato per il tablet."
  },
  {
    icon: Camera,
    title: "Scanner documenti",
    body: "Acquisisci PDF sul posto, collegali all’intervento e inviali al supporto quando la connessione lo consente."
  },
  {
    icon: Bell,
    title: "Promemoria intelligenti",
    body: "Notifiche nel browser e opzionale invio email per scadenze: meno dimenticanze, più continuità con il cliente."
  },
  {
    icon: Cloud,
    title: "Sync e multi-dispositivo",
    body: "IndexedDB in locale, Supabase in cloud: lavori offline e ritrovi tutto su telefono, iPad o desktop."
  },
  {
    icon: FileText,
    title: "Export PDF",
    body: "Report stampabili per consegna al cliente o archivio interno, coerenti con i dati dell’intervento."
  },
  {
    icon: Users,
    title: "Clienti strutturati",
    body: "Rubrica con anagrafica, tipologia attività e storico collegato alle visite."
  },
  {
    icon: Package,
    title: "Ricambi e magazzino",
    body: "Movimenti di stock legati agli interventi: traccia cosa è stato installato o prelevato."
  },
  {
    icon: Ticket,
    title: "Ticket CRM leggeri",
    body: "Segnalazioni e follow-up senza la pesantezza di un CRM enterprise: resti agile sul campo."
  },
  {
    icon: LayoutTemplate,
    title: "Modelli ripetibili",
    body: "Template per tipologie di intervento ricorrenti: parti già impostato e risparmi tempo amministrativo."
  },
  {
    icon: BarChart3,
    title: "Report e statistiche",
    body: "Esportazioni e numeri operativi per capire carico di lavoro, andamento e priorità."
  }
] as const;

const testimonials = [
  {
    quote:
      "Il punto di forza è poter chiudere un intervento in cantina senza rete, e vedere tutto allineato quando torno in ufficio.",
    role: "Tecnico manutentore — impianti professionali"
  },
  {
    quote:
      "Scanner e PDF ci hanno tolto il giro di foto su WhatsApp e fogli persi. Il cliente riceve qualcosa di leggibile subito.",
    role: "Responsabile assistenza — retail"
  },
  {
    quote:
      "Promemoria e scadenze su tablet hanno ridotto i ritardi sulle commesse ricorrenti. L’interfaccia è sobria, non distrae.",
    role: "Coordinatore team sul territorio"
  }
] as const;

/**
 * Public marketing home: Italian-first positioning for field technicians.
 * Authenticated users still see the page with a clear shortcut to the app shell.
 */
export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wrench className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-base sm:text-lg">WorkFlow</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
            {user ? (
              <>
                <span className="hidden max-w-[140px] truncate text-xs text-muted-foreground sm:inline">
                  {user.email}
                </span>
                <Button asChild size="sm" className="rounded-xl sm:h-10 sm:px-4">
                  <Link href="/dashboard">
                    Apri app
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild size="sm" className="rounded-xl sm:h-10">
                  <Link href="/login">Accedi</Link>
                </Button>
                <Button asChild size="sm" className="rounded-xl sm:h-10 sm:px-4">
                  <Link href="/register">Crea account gratuito</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div
            className={cn(
              "pointer-events-none absolute inset-0 opacity-40",
              "bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,hsl(var(--primary)/0.25),transparent_55%)]"
            )}
            aria-hidden
          />
          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                Offline-first · PWA · Supabase
              </div>
              <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                WorkFlow — il tuo assistente personale per interventi tecnici
              </h1>
              <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
                Pianifica, documenta e chiudi le visite sul campo anche senza connessione. WorkFlow
                tiene i dati sul dispositivo e li sincronizza in modo sicuro quando torni online:
                meno attrito, più controllo operativo.
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                {user ? (
                  <Button asChild size="lg" className="h-12 rounded-2xl px-8 text-base">
                    <Link href="/dashboard">
                      Vai alla dashboard
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild size="lg" className="h-12 rounded-2xl px-8 text-base">
                      <Link href="/register">
                        Crea account gratuito
                        <ArrowRight className="h-5 w-5" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="h-12 rounded-2xl px-8 text-base">
                      <Link href="/login">Accedi</Link>
                    </Button>
                  </>
                )}
              </div>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-primary" aria-hidden />
                  Sessione Supabase
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden />
                  Geocoding e mappe integrate
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="h-4 w-4 text-primary" aria-hidden />
                  Timer intervento
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Value props */}
        <section className="border-b bg-muted/30 py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  title: "Pensato per chi sta in movimento",
                  text: "Layout e azioni ottimizzati per iPhone e iPad: meno tap, più chiarezza sotto il sole o in cabina ascensore."
                },
                {
                  title: "Dati prima in locale",
                  text: "Niente schermate vuote in assenza di rete: scrivi, allega, cronometra. La sync riallinea tutto al ritorno della linea."
                },
                {
                  title: "Professionale verso il cliente",
                  text: "PDF, documenti e comunicazioni strutturate trasmettono ordine e affidabilità rispetto a messaggi sparsi."
                }
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border bg-background p-6 shadow-sm">
                  <h2 className="text-lg font-semibold tracking-tight">{item.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="py-14 sm:py-20" id="funzionalita">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Tutto ciò che serve sul campo</h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                Un solo strumento per collegare interventi, magazzino leggero, clienti e documentazione:
                senza sovraccaricare il team con complessità inutili.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, body }) => (
                <Card
                  key={title}
                  className="rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                      <Icon className="h-5 w-5 text-primary" aria-hidden />
                    </div>
                    <CardTitle className="text-base font-semibold">{title}</CardTitle>
                  </CardHeader>
                  <div className="px-5 pb-5 pt-0 md:px-6 md:pb-6">
                    <CardDescription className="text-sm leading-relaxed">{body}</CardDescription>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="border-y bg-muted/25 py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Perché i team operativi lo usano
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted-foreground sm:text-base">
              Obiettivo chiaro: meno attrito amministrativo, più tempo sul problema tecnico. Ecco cosa
              cercano — e trovano — in WorkFlow.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {testimonials.map((t, i) => (
                <Card key={i} className="rounded-2xl border bg-background shadow-sm">
                  <div className="p-5 pt-6 md:p-6">
                    <CheckCircle2 className="mb-3 h-5 w-5 text-primary" aria-hidden />
                    <blockquote className="text-sm leading-relaxed text-foreground">&ldquo;{t.quote}&rdquo;</blockquote>
                    <footer className="mt-4 text-xs font-medium text-muted-foreground">{t.role}</footer>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Pronto a organizzare il campo?</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Crea un account, installa la PWA e inizia dal primo intervento: nessun credito richiesto per provare il
              flusso base.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              {user ? (
                <Button asChild size="lg" className="h-12 rounded-2xl px-8 text-base">
                  <Link href="/dashboard">Apri WorkFlow</Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg" className="h-12 rounded-2xl px-8 text-base">
                    <Link href="/register">Crea account gratuito</Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="h-12 rounded-2xl px-8 text-base">
                    <Link href="/login">Accedi</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-muted/20 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 sm:text-left">
          <p>© {new Date().getFullYear()} WorkFlow. Tutti i diritti riservati.</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/login" className="underline-offset-4 hover:underline">
              Accedi
            </Link>
            <Link href="/register" className="underline-offset-4 hover:underline">
              Registrati
            </Link>
            {user ? (
              <Link href="/dashboard" className="underline-offset-4 hover:underline">
                Dashboard
              </Link>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
