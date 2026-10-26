'use client'
import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useUnsavedGuard } from '@/lib/ui'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// 단가 산정 폼 — 공통 규격 적용 [2026-10-13].
//
// 🔴종전: 날 input·select 9개 + 검증은 브라우저 기본(required·min)뿐이었다.
//   그 기본 검증은 «첫 칸 하나»만 말풍선으로 지적하고 멈추며, 우리 말투·위치를 따르지 않는다.
//   값이 범위를 벗어나도(비율이 1을 넘는 값 같은) 서버가 받아 산식이 엉뚱한 단가를 낸다.
// ⇒ zod 로 범위를 코드에 적고, 어긋난 칸 «옆»에서 막는다. ⛔서버 검증을 대신하지 않는다.

type Order = { id: string; order_no: string; org_name: string; headcount: number | null }

export function PricingForm({
  action, venueLabels, regions, orders, feeDefault, ratioDefault,
}: {
  action: (fd: FormData) => Promise<void>
  venueLabels: Record<string, string>
  /** 권역 → 회차당 이동비(0이면 없음) */
  regions: Record<string, number>
  orders: Order[]
  feeDefault: number
  ratioDefault: number
}) {
  const [pending, start] = useTransition()
  const schema = z.object({
    request: z.string().trim().min(10, '교육 요구를 10자 이상 적어 주십시오 — 짧으면 회차 분해가 어긋납니다.').max(2000, '2000자 이내로 적어 주십시오.'),
    headcount: z.coerce.number().int('정수로 적어 주십시오.').min(1, '1명 이상으로 적어 주십시오.').max(2000, '2000명을 넘을 수 없습니다.'),
    weeks: z.union([z.literal(''), z.coerce.number().int('정수로 적어 주십시오.').min(1, '1주 이상으로 적어 주십시오.').max(52, '52주를 넘을 수 없습니다.')]).optional(),
    audience: z.string().trim().max(40, '40자 이내로 적어 주십시오.').optional().or(z.literal('')),
    venueType: z.string().min(1),
    region: z.string().min(1),
    orderId: z.string().optional().or(z.literal('')),
    feePerSession: z.union([z.literal(''), z.coerce.number().min(0, '0 이상으로 적어 주십시오.').max(20_000_000, '2천만원을 넘을 수 없습니다.')]).optional(),
    outsourcedSessions: z.union([z.literal(''), z.coerce.number().int('정수로 적어 주십시오.').min(0).max(52, '52회를 넘을 수 없습니다.')]).optional(),
    directRatio: z.union([z.literal(''), z.coerce.number().min(0.05, '0.05 이상으로 적어 주십시오.').max(0.95, '0.95를 넘을 수 없습니다.')]).optional(),
  })
  type In = z.input<typeof schema>
  const form = useForm<In, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema), mode: 'onBlur',
    defaultValues: {
      request: '', headcount: 20, weeks: '', audience: '',
      venueType: Object.keys(venueLabels)[0] ?? '', region: Object.keys(regions)[0] ?? '',
      orderId: '', feePerSession: '', outsourcedSessions: '', directRatio: '',
    },
  })
  useUnsavedGuard(form.formState.isDirty, pending)

  const onSubmit = (v: z.output<typeof schema>) => {
    const fd = new FormData()
    for (const [k, val] of Object.entries(v)) if (val !== '' && val != null) fd.set(k, String(val))
    start(() => { void action(fd) })
  }
  const S = (v: unknown) => String(v ?? '')

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField control={form.control} name="request" render={({ field }) => (
          <FormItem>
            <FormLabel>교육 요구<span aria-hidden className="ml-0.5 text-destructive">*</span></FormLabel>
            <FormDescription>발주사가 적어 보낸 말 그대로 넣으십시오. 구체적일수록 회차 분해가 정확해집니다.</FormDescription>
            <FormControl>
              <Textarea rows={4} placeholder="예: 중간관리자 40명에게 데이터에 근거해 의사결정하는 법을 가르치고 싶습니다. 엑셀은 쓰지만 지표를 어떻게 읽어야 할지 모릅니다. 8주 정도 생각합니다." {...field} value={S(field.value)} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid gap-4 sm:grid-cols-3 sm:items-start">
          <FormField control={form.control} name="headcount" render={({ field }) => (
            <FormItem>
              <FormLabel>교육 인원<span aria-hidden className="ml-0.5 text-destructive">*</span></FormLabel>
              <FormControl><Input type="number" min={1} max={2000} inputMode="numeric" {...field} value={S(field.value)} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="weeks" render={({ field }) => (
            <FormItem>
              <FormLabel>희망 주차</FormLabel>
              <FormControl><Input type="number" min={1} max={52} placeholder="예: 8" inputMode="numeric" {...field} value={S(field.value)} /></FormControl>
              <FormDescription>비우면 회차 수를 AI가 제안합니다.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="audience" render={({ field }) => (
            <FormItem>
              <FormLabel>대상 층</FormLabel>
              <FormControl><Input placeholder="예: 중간관리자" {...field} value={S(field.value)} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3 sm:items-start">
          <FormField control={form.control} name="venueType" render={({ field }) => (
            <FormItem>
              <FormLabel>진행 형태</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>{Object.entries(venueLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="region" render={({ field }) => (
            <FormItem>
              <FormLabel>권역</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {Object.entries(regions).map(([r, fee]) => (
                    <SelectItem key={r} value={r}>{r}{fee > 0 ? ` · 회차당 ${fee.toLocaleString('ko-KR')}원` : ' · 이동비 없음'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>사내 출강일 때만 이동비가 붙습니다.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="orderId" render={({ field }) => (
            <FormItem>
              <FormLabel>발주 연결</FormLabel>
              <Select value={field.value || '__none'} onValueChange={(v) => field.onChange(v === '__none' ? '' : v)}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="__none">연결 안 함</SelectItem>
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_no} · {o.org_name} · {o.headcount ?? '—'}명</SelectItem>)}
                </SelectContent>
              </Select>
              <FormDescription>연결하지 않으면 테스트 산출로 남습니다.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* 산식 입력 — 기본값이 있으나 발주마다 다를 수 있다. 숨기지 않고 보여 준다 */}
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">산식 입력 — 강사료·초빙 회차·목표 직접비율</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-3 sm:items-start">
            <FormField control={form.control} name="feePerSession" render={({ field }) => (
              <FormItem>
                <FormLabel>회당 강사료</FormLabel>
                <FormControl><Input type="number" min={0} step={100000} inputMode="numeric" placeholder={String(feeDefault)} {...field} value={S(field.value)} /></FormControl>
                <FormDescription>기본 {feeDefault.toLocaleString('ko-KR')}원 · 발주마다 고칠 수 있습니다</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="outsourcedSessions" render={({ field }) => (
              <FormItem>
                <FormLabel>초빙 회차</FormLabel>
                <FormControl><Input type="number" min={0} max={52} inputMode="numeric" {...field} value={S(field.value)} /></FormControl>
                <FormDescription>비우면 전 회차를 초빙으로 봅니다. 적게 잡으면 적자가 됩니다.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="directRatio" render={({ field }) => (
              <FormItem>
                <FormLabel>목표 직접비율</FormLabel>
                <FormControl><Input type="number" min={0.05} max={0.95} step={0.01} inputMode="decimal" placeholder={String(ratioDefault)} {...field} value={S(field.value)} /></FormControl>
                <FormDescription>기본 {ratioDefault} · 운영 3과정 역산값</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </details>

        <Button type="submit" disabled={pending}>{pending ? '산정 중' : '분해하고 단가 산정'}</Button>
      </form>
    </Form>
  )
}
