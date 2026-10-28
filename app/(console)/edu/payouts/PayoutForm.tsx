'use client'
import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useUnsavedGuard } from '@/lib/ui'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// 강사료 정산 산출 폼 — 공통 규격 적용 [2026-10-12].
//
// 🔴종전: 날 input 3개 + 검증 0. 회차를 0 으로 적거나 계약 잔여보다 크게 적어도 그대로 서버로 갔다.
//   정산은 «돈이 나가는 자리»라 틀린 값이 조용히 통과하면 안 된다.
// ⇒ zod 로 범위를 코드에 적고, 잔여 회차를 넘기면 그 칸 옆에서 막는다.
// ⛔서버 검증을 대신하지 않는다 — actions.ts 가 최종 방어선이다.

export function PayoutForm({
  action, contractId, remaining, feePlaceholder,
}: {
  action: (fd: FormData) => Promise<void>
  contractId: string
  /** 계약 잔여 회차(모르면 undefined) — 넘겨 받으면 상한으로 쓴다. */
  remaining?: number
  feePlaceholder?: string
}) {
  const [pending, start] = useTransition()
  const max = remaining && remaining > 0 ? remaining : 200
  const schema = z.object({
    sessionsDone: z.coerce.number().int('정수로 적어 주십시오.').min(1, '1회 이상으로 적어 주십시오.')
      .max(max, remaining ? `계약 잔여 ${remaining}회를 넘을 수 없습니다.` : '200회를 넘을 수 없습니다.'),
    feePerSession: z.union([z.literal(''), z.coerce.number().min(0, '0 이상으로 적어 주십시오.')]).optional(),
    periodLabel: z.string().trim().max(40, '40자 이내로 적어 주십시오.').optional().or(z.literal('')),
  })
  type Values = z.input<typeof schema>
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema), mode: 'onBlur',
    defaultValues: { sessionsDone: remaining && remaining > 0 ? remaining : 1, feePerSession: '', periodLabel: '' },
  })
  useUnsavedGuard(form.formState.isDirty, pending)

  const onSubmit = (v: z.output<typeof schema>) => {
    const fd = new FormData()
    fd.set('contractId', contractId)
    fd.set('sessionsDone', String(v.sessionsDone))
    if (v.feePerSession !== '' && v.feePerSession != null) fd.set('feePerSession', String(v.feePerSession))
    if (v.periodLabel) fd.set('periodLabel', v.periodLabel)
    start(() => { void action(fd) })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        data-contract-id={contractId}
        className="mt-2 flex flex-wrap items-start gap-3"
      >
        <FormField control={form.control} name="sessionsDone" render={({ field }) => (
          <FormItem className="w-28">
            <FormLabel className="text-xs">실시한 회차</FormLabel>
            <FormControl><Input type="number" min={1} max={max} inputMode="numeric" {...field} value={String(field.value ?? '')} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="feePerSession" render={({ field }) => (
          <FormItem className="w-40">
            <FormLabel className="text-xs">회당 강사료</FormLabel>
            <FormControl><Input type="number" min={0} step={10000} inputMode="numeric" placeholder={feePlaceholder ?? '계약 금액'} {...field} value={String(field.value ?? '')} /></FormControl>
            <FormDescription className="text-[11px]">비우면 계약 금액.</FormDescription>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="periodLabel" render={({ field }) => (
          <FormItem className="min-w-[200px] grow">
            <FormLabel className="text-xs">기간 표기</FormLabel>
            <FormControl><Input placeholder="예: 2027년 3월분" {...field} value={String(field.value ?? '')} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" variant="outline" size="sm" disabled={pending} className="mt-5">
          {pending ? '산출 중' : '정산 산출'}
        </Button>
      </form>
    </Form>
  )
}
