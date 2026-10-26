'use client'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUnsavedGuard } from '@/lib/ui'

// 기수 개설·수정 폼 — ERP 규격 재건 [대표님 승인 2026-10-12 「shadcn 도입의 완성도를 높이도록」].
//
// 🔴종전 문제(대표님 적발): 15칸이 섹션 없이 평면으로 나열 · 필수 표시 없음 · 오류가 칸 옆에 안 뜸 ·
//   날짜칸이 제목칸만큼 넓음 · 저장 버튼이 맨 아래 왼쪽. 원자(shadcn Input)는 쓰고 있었으나
//   «폼 규격»이 없어 조악했다 — 부족했던 것은 라이브러리가 아니라 layout·검증 규격이다.
// ⇒ shadcn Form(react-hook-form + zod)으로 규격을 «강제»한다. 라벨·설명·오류 위치가 컴포넌트에 박혀 있다.
//
// ★한 벌로 쓰는 이유(기존 유지) = 두 벌이면 언젠가 한쪽에만 칸이 생긴다. 개설에서 넣을 수 있고
//   수정에서 못 고치는 값이 있으면 운영자는 SQL 로 돌아간다. 다른 것은 «과정·기수번호»뿐이다.
// ⛔색을 하드코딩하지 않는다 — 다크모드에서 뒤집히지 않는다(토큰만 쓴다).

export type ProgramOption = { slug: string; name: string; price: number | null }

const STATUS = [
  { value: 'draft', label: '준비 — 대외 화면에 나가지 않음' },
  { value: 'recruiting', label: '모집중 — 대외 공개·신청 접수' },
  { value: 'closed', label: '모집 마감' },
  { value: 'running', label: '운영 중' },
  { value: 'completed', label: '종료' },
  { value: 'cancelled', label: '개설 취소 — 대외 화면에서 내림' },
]
const PAY = [
  { value: 'transfer', label: '계좌이체 — 접수 후 개별 안내' },
  { value: 'card', label: '카드 결제창' },
  { value: 'both', label: '둘 다' },
]

// ★검증은 스키마가 쥔다 — 화면이 아니라 여기서 틀린 값을 막는다.
//   ⛔서버 검증을 대신하지 않는다(actions.ts 가 최종 방어선). 여기는 «그 칸 옆에서» 말해 주는 층이다.
const schema = z.object({
  program_slug: z.string().min(1, '과정을 선택해 주십시오.'),
  cohort_no: z.coerce.number().int('정수로 적어 주십시오.').min(1, '1 이상으로 적어 주십시오.'),
  title: z.string().max(80, '80자 이내로 적어 주십시오.').optional().or(z.literal('')),
  subtitle: z.string().max(80, '80자 이내로 적어 주십시오.').optional().or(z.literal('')),
  status: z.string().min(1),
  payment_method: z.string().min(1),
  recruit_from: z.string().optional().or(z.literal('')),
  recruit_to: z.string().optional().or(z.literal('')),
  starts_on: z.string().optional().or(z.literal('')),
  ends_on: z.string().optional().or(z.literal('')),
  capacity: z.string().optional().or(z.literal('')),
  price: z.string().optional().or(z.literal('')),
  attend_pct_required: z.coerce.number().min(0, '0~100 사이로 적어 주십시오.').max(100, '0~100 사이로 적어 주십시오.'),
  price_note: z.string().max(120, '120자 이내로 적어 주십시오.').optional().or(z.literal('')),
  venue: z.string().max(80).optional().or(z.literal('')),
  venue_note: z.string().max(120).optional().or(z.literal('')),
  venue_confirmed: z.boolean(),
  is_test: z.boolean(),
})
  // 날짜 순서는 «칸 하나»의 문제가 아니라 둘의 관계다 — 그래서 refine 으로 잡고 뒤 칸에 붙인다.
  .refine((v) => !v.recruit_from || !v.recruit_to || v.recruit_from <= v.recruit_to,
    { path: ['recruit_to'], message: '모집 시작보다 뒤여야 합니다.' })
  .refine((v) => !v.starts_on || !v.ends_on || v.starts_on <= v.ends_on,
    { path: ['ends_on'], message: '개강일보다 뒤여야 합니다(1회 과정은 같게).' })

type Values = z.input<typeof schema>
type Parsed = z.output<typeof schema>

export type CohortDefaults = Partial<{
  title: string | null; subtitle: string | null; status: string
  recruit_from: string | null; recruit_to: string | null; starts_on: string | null; ends_on: string | null
  capacity: number | null; price: number | null; price_note: string | null
  venue: string | null; venue_confirmed: boolean; venue_note: string | null
  attend_pct_required: number; payment_method: string; is_test: boolean
}>

// 섹션 — 15칸을 「무엇을 정하는 묶음인가」로 가른다. ERP 폼의 기본 단위다.
function Section({ title, desc, children, cols = 2 }: { title: string; desc?: string; children: React.ReactNode; cols?: 1 | 2 | 3 | 4 }) {
  const grid = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols]
  return (
    <section className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <div className={`grid gap-x-4 gap-y-4 ${grid}`}>{children}</div>
    </section>
  )
}
const Req = () => <span aria-hidden className="text-destructive ml-0.5">*</span>

export function CohortFields({
  mode, programs = null, nextNoBySlug, defaults, submitLabel, action,
}: {
  mode: 'create' | 'edit'
  programs?: ProgramOption[] | null
  nextNoBySlug?: Record<string, number>
  defaults?: CohortDefaults
  submitLabel: string
  /** 서버액션(FormData) — 폼이 직접 부른다. 검증 실패 시 호출하지 않는다. */
  action: (fd: FormData) => Promise<void>
}) {
  const creating = mode === 'create'
  const [pending, start] = useTransition()
  const [slug0] = useState(programs?.[0]?.slug ?? '')

  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      program_slug: slug0,
      cohort_no: nextNoBySlug?.[slug0] ?? 1,
      title: defaults?.title ?? '', subtitle: defaults?.subtitle ?? '',
      status: defaults?.status ?? 'draft', payment_method: defaults?.payment_method ?? 'transfer',
      recruit_from: defaults?.recruit_from ?? '', recruit_to: defaults?.recruit_to ?? '',
      starts_on: defaults?.starts_on ?? '', ends_on: defaults?.ends_on ?? '',
      capacity: defaults?.capacity != null ? String(defaults.capacity) : '',
      price: defaults?.price != null ? String(defaults.price) : '',
      attend_pct_required: defaults?.attend_pct_required ?? 67,
      price_note: defaults?.price_note ?? '', venue: defaults?.venue ?? '', venue_note: defaults?.venue_note ?? '',
      venue_confirmed: defaults?.venue_confirmed ?? false, is_test: defaults?.is_test ?? false,
    },
  })
  // 고쳐 놓고 나가면 입력이 사라진다 — 변경이 있을 때만 붙잡는다(공용 훅·2026-10-12).
  useUnsavedGuard(form.formState.isDirty, pending)
  const slug = form.watch('program_slug')
  const picked = programs?.find((p) => p.slug === slug)

  if (creating && !programs) {
    return (
      <p className="text-sm text-muted-foreground">
        과정 목록을 읽지 못했습니다. <strong>과정이 없다는 뜻은 아닙니다</strong> — 잠시 후 다시 열어
        주십시오. 계속 같으면 edu 앱의 <code>/api/programs</code> 를 확인해야 합니다.
      </p>
    )
  }

  const onSubmit = (v: Parsed) => {
    const fd = new FormData()
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'boolean') { if (val) fd.set(k, 'on'); continue }
      fd.set(k, String(val ?? ''))
    }
    start(() => { void action(fd) })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {creating && (
          <Section title="기수 신원" desc="과정과 기수 번호는 개설할 때만 정합니다 — 뒤에 바꾸면 이미 나간 안내와 어긋납니다." cols={2}>
            <FormField control={form.control} name="program_slug" render={({ field }) => (
              <FormItem>
                <FormLabel>과정<Req /></FormLabel>
                <Select value={field.value} onValueChange={(v) => {
                  field.onChange(v)
                  // 과정을 바꾸면 그 과정의 «다음 번호»로 다시 채운다 — 중복 번호가 가장 흔한 실수다.
                  form.setValue('cohort_no', nextNoBySlug?.[v] ?? 1, { shouldValidate: true })
                }}>
                  <FormControl><SelectTrigger><SelectValue placeholder="과정 선택" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {(programs ?? []).map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.name}{p.price === null ? ' · 정가 미확정' : ` · ${p.price.toLocaleString()}원`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>커리큘럼·정가는 코드(lib/programs.ts)가 갖습니다.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="cohort_no" render={({ field }) => (
              <FormItem className="sm:max-w-[160px]">
                <FormLabel>기수 번호<Req /></FormLabel>
                <FormControl><Input type="number" min={1} inputMode="numeric" {...field} value={String(field.value ?? '')} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </Section>
        )}

        <Section title="표기" desc="대외 화면에 나가는 이름입니다." cols={2}>
          <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem>
              <FormLabel>제목</FormLabel>
              <FormControl><Input placeholder="예: Decision Clinic 2기" {...field} /></FormControl>
              <FormDescription>비우면 「{'{과정명}'} n기」로 조합됩니다.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="subtitle" render={({ field }) => (
            <FormItem><FormLabel>부제</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </Section>

        <Section title="공개와 결제" cols={2}>
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>상태<Req /></FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>{STATUS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <FormDescription>모집중으로 열면 그 즉시 대외 공개됩니다.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="payment_method" render={({ field }) => (
            <FormItem>
              <FormLabel>결제 방식<Req /></FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>{PAY.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </Section>

        {/* 날짜는 «좁은 칸»이다 — 제목칸과 같은 너비로 두면 화면이 엉성해진다(대표님 지적). */}
        <Section title="일정" desc="모집 기간과 과정 기간입니다." cols={4}>
          {([['recruit_from', '모집 시작'], ['recruit_to', '모집 마감'], ['starts_on', '개강일'], ['ends_on', '종료일']] as const).map(([name, label]) => (
            <FormField key={name} control={form.control} name={name} render={({ field }) => (
              <FormItem className="sm:max-w-[200px]">
                <FormLabel>{label}</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                {name === 'ends_on' && <FormDescription>1회 과정은 개강일과 같게.</FormDescription>}
                <FormMessage />
              </FormItem>
            )} />
          ))}
        </Section>

        <Section title="정원과 금액" cols={3}>
          <FormField control={form.control} name="capacity" render={({ field }) => (
            <FormItem className="sm:max-w-[180px]">
              <FormLabel>정원(명)</FormLabel>
              <FormControl><Input type="number" min={1} inputMode="numeric" {...field} value={String(field.value ?? '')} /></FormControl>
              <FormDescription>비우면 미기재.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="price" render={({ field }) => (
            <FormItem className="sm:max-w-[220px]">
              <FormLabel>이번 회차 수강료(원)</FormLabel>
              <FormControl>
                <Input type="number" min={0} inputMode="numeric"
                  placeholder={picked?.price != null ? String(picked.price) : '미확정'} {...field} />
              </FormControl>
              {/* ★빈칸과 0 은 다르다 — 0원은 「무료」라는 사실 주장이 된다. */}
              <FormDescription>비우면 미확정 — 신청·결제 경로가 열리지 않습니다.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="attend_pct_required" render={({ field }) => (
            <FormItem className="sm:max-w-[180px]">
              <FormLabel>수료 출석 요건(%)<Req /></FormLabel>
              <FormControl><Input type="number" min={0} max={100} inputMode="numeric" {...field} value={String(field.value ?? '')} /></FormControl>
              <FormDescription>기본 67% = 2/3 이상(국내 최고위과정 관례).</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="price_note" render={({ field }) => (
            <FormItem className="sm:col-span-3">
              <FormLabel>수강료 메모</FormLabel>
              <FormControl><Input placeholder="예: 기관 협의 후 확정" {...field} /></FormControl>
              <FormDescription>수강료가 미확정일 때 그 이유 — 화면이 지어내지 않게.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
        </Section>

        <Section title="장소" cols={2}>
          <FormField control={form.control} name="venue" render={({ field }) => (
            <FormItem><FormLabel>장소</FormLabel><FormControl><Input placeholder="예: 세종대학교 대양 AI센터" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="venue_note" render={({ field }) => (
            <FormItem><FormLabel>장소 메모</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="venue_confirmed" render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <label className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5 cursor-pointer">
                <FormControl>
                  <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)}
                    className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
                </FormControl>
                <span className="text-sm">
                  장소 확정
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    끄면 테스트 공고일 때 기관명을 서버가 아예 보내지 않습니다. 협의 전 기관명을 확정으로 적으면 화면에서 사실처럼 읽힙니다.
                  </span>
                </span>
              </label>
            </FormItem>
          )} />
          <FormField control={form.control} name="is_test" render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <label className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5 cursor-pointer">
                <FormControl>
                  <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)}
                    className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
                </FormControl>
                <span className="text-sm">
                  테스트(시연) 공고
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    화면에 「테스트 공고」가 붙고, 미확정 장소는 서버가 보내지 않습니다.
                  </span>
                </span>
              </label>
            </FormItem>
          )} />
        </Section>

        {/* 액션 바 — 긴 폼에서 저장 버튼을 찾아 내려가지 않게 아래에 붙여 둔다. */}
        {/* 액션 바 — 카드 «안쪽 바닥»에 정확히 붙인다.
            🔴2026-10-12 대표님 적발: -mx-6 만 주고 -mb-6 을 안 줘서 바 아래에 카드 여백이 남았고,
              그 아래로 카드 자신의 테두리가 보여 «이중선»이 됐다. 모서리도 직선이 둥근 모서리를 가로질렀다.
            ⛔더 근본 원인: CardContent 패딩은 p-4(16px)인데 -mx-6(24px)을 줘 선이 좌우로 8px씩
              «삐져나왔다». 음수 마진은 «그 카드의 실제 패딩»과 같은 값이어야 한다.
            ⇒ -mx-4 -mb-4 + px-4, 아래 모서리는 카드와 같게 둥글린다. */}
        <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 flex items-center justify-end gap-3 rounded-b-xl border-t border-border bg-card/95 px-4 py-3.5 backdrop-blur">
          {form.formState.isSubmitted && !form.formState.isValid && (
            <span role="status" className="mr-auto text-sm text-destructive">입력을 확인해 주십시오 — 표시된 칸을 고치면 저장됩니다.</span>
          )}
          <Button type="submit" disabled={pending}>{pending ? '저장 중' : submitLabel}</Button>
        </div>
      </form>
    </Form>
  )
}
