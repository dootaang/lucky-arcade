import { IconDeviceGamepad2, IconFileAnalytics, IconLock } from "@tabler/icons-react";
import { Button } from "@lucky-arcade/ui";
import type { ReactNode } from "react";

export function Home() {
  return <main className="min-h-dvh bg-[var(--canvas)] px-6 py-10 text-[var(--text)]">
    <div className="mx-auto grid max-w-5xl gap-8">
      <header className="grid gap-3">
        <span className="text-sm font-semibold text-[var(--accent)]">100% 로컬 · 무LLM</span>
        <h1 className="text-4xl font-black tracking-tight">럭키★오락실</h1>
        <p className="max-w-2xl text-[var(--muted)]">봇카드가 게임 카트리지가 됩니다. 지금은 카드 적합도 검사 코어를 검증하는 단계입니다.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        <Info icon={<IconFileAnalytics />} title="재료부터 검사" text="카드에 실제로 있는 로어·NPC·에셋만 사용합니다." />
        <Info icon={<IconDeviceGamepad2 />} title="결정론 판정" text="같은 카드와 시드는 언제나 같은 결과를 냅니다." />
        <Info icon={<IconLock />} title="기기 밖으로 전송 안 함" text="카드 분석과 게임 판정은 브라우저 안에서 처리합니다." />
      </section>
      <div><Button disabled>카드 넣기 · 코어 관문 통과 후 연결</Button></div>
    </div>
  </main>;
}

function Info({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <article className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
    <span className="text-[var(--accent)]">{icon}</span><h2 className="font-bold">{title}</h2><p className="text-sm leading-6 text-[var(--muted)]">{text}</p>
  </article>;
}
