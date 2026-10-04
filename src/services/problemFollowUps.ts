import { supabase } from './supabase';

export type FollowUpKind = 'note' | 'call_customer' | 'call_branch' | 'no_answer' | 'status';

export interface FollowUp {
  id: string;
  problemId: string;
  userName: string;
  kind: FollowUpKind;
  note: string;
  nextFollowUpAt?: string;
  createdAt: string;
}

export const FOLLOWUP_KIND_LABEL: Record<FollowUpKind, string> = {
  note: 'ملاحظة',
  call_customer: 'اتصال بالعميل',
  call_branch: 'تواصل مع الفرع',
  no_answer: 'العميل لم يرد',
  status: 'تغيير حالة',
};

const fromRow = (r: any): FollowUp => ({
  id: r.id,
  problemId: r.problem_id,
  userName: r.user_name || 'مستخدم',
  kind: (r.kind as FollowUpKind) || 'note',
  note: r.note || '',
  nextFollowUpAt: r.next_followup_at || undefined,
  createdAt: r.created_at,
});

export const listFollowUps = async (problemId: string): Promise<{ items: FollowUp[]; error?: string }> => {
  const { data, error } = await supabase
    .from('problem_followups')
    .select('*')
    .eq('problem_id', problemId)
    .order('created_at', { ascending: false });
  if (error) return { items: [], error: error.message };
  return { items: (data || []).map(fromRow) };
};

export const addFollowUp = async (input: {
  problemId: string;
  userId?: string;
  userName?: string;
  kind: FollowUpKind;
  note: string;
  nextFollowUpAt?: string;
}): Promise<{ item?: FollowUp; error?: string }> => {
  const { data, error } = await supabase
    .from('problem_followups')
    .insert({
      problem_id: input.problemId,
      user_id: input.userId || null,
      user_name: input.userName || null,
      kind: input.kind,
      note: input.note,
      next_followup_at: input.nextFollowUpAt || null,
    })
    .select('*')
    .single();
  if (error) return { error: error.message };
  return { item: fromRow(data) };
};
