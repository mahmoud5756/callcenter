import { Order, Problem, User, BranchAnomaly } from '../types';

/**
 * Normalizes phone numbers for accurate spatial deduplication and matching
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  // Strip all non-numeric characters
  let cleaned = rawPhone.replace(/[^0-9]/g, '');

  // Handle +20 or 0020 Egyptian country codes
  if (cleaned.startsWith('201') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  } else if (cleaned.startsWith('00201') && cleaned.length === 14) {
    cleaned = '0' + cleaned.substring(4);
  } else if (cleaned.startsWith('1') && cleaned.length === 10) {
    // Missing leading zero (10XXXXXXXX -> 010XXXXXXXX)
    cleaned = '0' + cleaned;
  }

  return cleaned;
}

/**
 * Levenshtein distance for fuzzy name comparison
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const track = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(null));

  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  const maxLength = Math.max(s1.length, s2.length);
  return 1 - track[s2.length][s1.length] / maxLength;
}

/**
 * ALGORITHM 1: Smart Multi-Factor Queue Prioritization Algorithm
 * Computes dynamic priority score (0 - 100) and actionable reasons for fast call queue sorting.
 */
export function calculateOrderPriority(
  order: Order,
  allOrders: Order[],
  problems: Problem[],
  activeAnomalies: BranchAnomaly[] = []
): {
  score: number;
  level: 'critical' | 'high' | 'medium' | 'normal';
  reasons: string[];
} {
  let score = 20; // baseline
  const reasons: string[] = [];

  // Factor 1: Re-order after Void (+40 points) - Highest retention risk!
  if (order.replacementForOrderId) {
    score += 40;
    reasons.push('أوردر بديل لأوردر ملغي سابق (أعلى أولوية لإنقاذ العميل)');
  }

  // Factor 2: Callback Requested (+35 points)
  if (order.status === 'callback_requested') {
    score += 35;
    reasons.push('العميل طلب معاودة الاتصال به هاتفياً');
  }

  // Factor 3: VIP High Ticket Amount
  if (order.totalAmount >= 600) {
    score += 30;
    reasons.push(`طلب VIP كبير بقيمة (${order.totalAmount} ج.م)`);
  } else if (order.totalAmount >= 350) {
    score += 15;
    reasons.push(`طلب ذو قيمة مرتفعة (${order.totalAmount} ج.م)`);
  }

  // Factor 4: Historical Customer Complaints
  const customerPastProblems = problems.filter(
    (p) => p.customerPhone === order.customerPhone && p.orderId !== order.id
  );
  if (customerPastProblems.length > 0) {
    score += 25;
    reasons.push(`العميل لديه (${customerPastProblems.length}) شكوى سابقة مسجلة`);
  }

  // Factor 5: Branch Anomaly Risk Factor
  const branchAnomaly = activeAnomalies.find((a) => a.branchName === order.branchName);
  if (branchAnomaly) {
    score += 20;
    reasons.push(`الفرع (${order.branchName}) لديه تنبيه تشغيلي نشط (${branchAnomaly.title})`);
  }

  // Factor 6: Elapsed Time Since Order
  if (order.orderTime) {
    const [hours, minutes] = order.orderTime.split(':').map((v) => parseInt(v, 10));
    if (!isNaN(hours)) {
      const now = new Date();
      const orderMinutes = hours * 60 + (minutes || 0);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const diffMinutes = currentMinutes - orderMinutes;

      if (diffMinutes > 120) {
        score += 15;
        reasons.push('مضى أكثر من ساعتين على تسليم الطلب');
      } else if (diffMinutes > 45) {
        score += 10;
        reasons.push('مضى أكثر من 45 دقيقة (الوقت المثالي لقياس الرضا)');
      }
    }
  }

  // Factor 7: Previous Call Unanswered
  if (order.status === 'no_answer') {
    score += 8;
    reasons.push('محاولة ثانية بعد عدم الرد');
  }

  // Bound score between 0 and 100
  const finalScore = Math.min(100, Math.max(0, score));

  let level: 'critical' | 'high' | 'medium' | 'normal' = 'normal';
  if (finalScore >= 80) level = 'critical';
  else if (finalScore >= 60) level = 'high';
  else if (finalScore >= 40) level = 'medium';

  return {
    score: finalScore,
    level,
    reasons: reasons.length > 0 ? reasons : ['متابعة روتينية ضمن الجدول اليومي'],
  };
}

/**
 * ALGORITHM 2: Smart Balanced Workload Equal-Load Distribution Algorithm
 * Balances agent capacity taking into account active load and high-risk case distribution.
 */
export function smartBalancedAssignment(
  ordersToAssign: Order[],
  activeAgents: User[],
  allOrders: Order[]
): Map<string, { userId: string; userName: string }> {
  const assignmentMap = new Map<string, { userId: string; userName: string }>();
  if (activeAgents.length === 0 || ordersToAssign.length === 0) return assignmentMap;

  // Calculate current workload score for each agent:
  // In-progress = weight 2, Pending = weight 1, Completed = weight 0
  const agentWorkloadMap = new Map<string, number>();

  for (const agent of activeAgents) {
    const agentOrders = allOrders.filter(
      (o) => !o.isVoid && o.assignedToUserId === agent.id
    );
    const activeLoad = agentOrders.reduce((sum, ord) => {
      if (ord.status === 'in_progress') return sum + 2;
      if (ord.status === 'pending' || ord.status === 'callback_requested') return sum + 1;
      return sum;
    }, 0);
    agentWorkloadMap.set(agent.id, activeLoad);
  }

  // Sort orders by priority score descending so critical calls are spread first
  const sortedOrders = [...ordersToAssign].sort(
    (a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)
  );

  for (const order of sortedOrders) {
    // Pick the agent with the lowest current workload score
    let minLoad = Infinity;
    // Branch-aware: agents assigned to this order's branch; else unrestricted agents; else everyone
    const branchAgents = activeAgents.filter((a) => a.assignedBranches?.includes(order.branchName));
    const freeAgents = activeAgents.filter((a) => !a.assignedBranches || a.assignedBranches.length === 0);
    const candidates = branchAgents.length ? branchAgents : freeAgents.length ? freeAgents : activeAgents;
    let selectedAgent = candidates[0];

    for (const agent of candidates) {
      const currentLoad = agentWorkloadMap.get(agent.id) || 0;
      if (currentLoad < minLoad) {
        minLoad = currentLoad;
        selectedAgent = agent;
      }
    }

    assignmentMap.set(order.id, {
      userId: selectedAgent.id,
      userName: selectedAgent.name,
    });

    // Increment agent load dynamically
    const weight = (order.priorityScore || 0) >= 70 ? 1.5 : 1.0;
    agentWorkloadMap.set(selectedAgent.id, minLoad + weight);
  }

  return assignmentMap;
}

/**
 * ALGORITHM 3: Statistical Branch Anomaly & Spike Detection Algorithm
 * Identifies sudden operational clusters (Cold food, Missing items, High void spikes).
 */
export function detectBranchAnomalies(
  allOrders: Order[],
  problems: Problem[]
): BranchAnomaly[] {
  const anomalies: BranchAnomaly[] = [];
  const branchOrdersMap = new Map<string, Order[]>();

  for (const order of allOrders) {
    const b = order.branchName || 'الفرع الرئيسي';
    if (!branchOrdersMap.has(b)) branchOrdersMap.set(b, []);
    branchOrdersMap.get(b)!.push(order);
  }

  for (const [branchName, orders] of branchOrdersMap.entries()) {
    if (orders.length < 3) continue; // Minimum sample size

    const voidCount = orders.filter((o) => o.isVoid).length;
    const voidRate = Math.round((voidCount / orders.length) * 100);

    const branchProblems = problems.filter((p) => p.branchName === branchName);
    const problemRate = Math.round((branchProblems.length / orders.length) * 100);

    // Rule 1: High Void Rate Spike (> 18%)
    if (voidRate >= 18 && voidCount >= 2) {
      anomalies.push({
        id: `anom-void-${branchName}`,
        branchName,
        severity: 'critical',
        anomalyType: 'high_void_rate',
        title: `ارتفاع حاد في نسبة الإلغاء (${voidRate}%)`,
        description: `تم رصد (${voidCount}) أوردرات ملغية من أصل (${orders.length}) طلبات.`,
        affectedOrdersCount: voidCount,
        ratePercentage: voidRate,
        recommendedAction: 'توجيه مدير التشغيل لمراجعة الكاشير ومطبخ الفرع للوقوف على أسباب الإلغاء.',
        detectedAt: new Date().toISOString(),
      });
    }

    // Rule 2: Cluster of Cold Food Complaints (3+ cold food cases)
    const coldFoodCases = branchProblems.filter(
      (p) => p.type.includes('بارد') || p.details.includes('بارد')
    );
    if (coldFoodCases.length >= 2) {
      anomalies.push({
        id: `anom-cold-${branchName}`,
        branchName,
        severity: 'warning',
        anomalyType: 'cold_food_cluster',
        title: `تكرار ملحوظ لشكاوى (الأكل وصل بارد)`,
        description: `تم تسجيل (${coldFoodCases.length}) شكاوى تتعلق ببرودة الطعام والتأخير.`,
        affectedOrdersCount: coldFoodCases.length,
        ratePercentage: Math.round((coldFoodCases.length / orders.length) * 100),
        recommendedAction: 'مراجعة حقائب الدليفري الحرارية وسرعة تسليم الطلبات للطيارين من الفرع.',
        detectedAt: new Date().toISOString(),
      });
    }

    // Rule 3: Cluster of Missing Items (3+ missing item cases)
    const missingItemCases = branchProblems.filter(
      (p) => p.type.includes('ناقص') || p.details.includes('ناقص')
    );
    if (missingItemCases.length >= 2) {
      anomalies.push({
        id: `anom-miss-${branchName}`,
        branchName,
        severity: 'warning',
        anomalyType: 'missing_items_cluster',
        title: `تكرار مشكلة (أصناف ناقصة في الأوردر)`,
        description: `تم رصد (${missingItemCases.length}) حالات نقص في الأصناف المسلّمة.`,
        affectedOrdersCount: missingItemCases.length,
        ratePercentage: Math.round((missingItemCases.length / orders.length) * 100),
        recommendedAction: 'التأكيد على موظف التقفيل والـ Quality Checker في محطة التسليم قبل الإغلاق.',
        detectedAt: new Date().toISOString(),
      });
    }

    // Rule 4: High Overall Complaint Rate (> 15%)
    if (problemRate >= 15 && branchProblems.length >= 3) {
      anomalies.push({
        id: `anom-prob-${branchName}`,
        branchName,
        severity: 'critical',
        anomalyType: 'high_complaint_rate',
        title: `معدل شكاوى مرتفع في الفرع (${problemRate}%)`,
        description: `بلغ إجمالي الشكاوى المسجلة (${branchProblems.length}) شكاوى.`,
        affectedOrdersCount: branchProblems.length,
        ratePercentage: problemRate,
        recommendedAction: 'إخطار المشرف الإقليمي ومدير الجودة لزيارة تفقدية عاجلة للفرع.',
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return anomalies;
}

/**
 * ALGORITHM 4: Context-Aware Smart Call Script Generator
 * Dynamically composes professional phrasing tailored to the customer's exact history.
 */
export function generateSmartCallScript(
  order: Order,
  pastProblemsCount: number = 0
): {
  greeting: string;
  openingPitch: string;
  keyQuestion: string;
  closureTamam: string;
  closureProblem: string;
} {
  // Scenario A: Re-ordered after a canceled/void order
  if (order.replacementForOrderId) {
    return {
      greeting: `مساء الخير يا فندم، مع حضرتك من خدمة عملاء وسعادة الزبائن في مطاعمنا، بتواصل مع الأستاذ/ة ${order.customerName}؟`,
      openingPitch: `حبينا نتابع مع حضرتك خصيصاً بخصوص الأوردر البديل اللي وصل لحضرتك النهاردة (#${order.orderNumber}) بعد ما حصل إلغاء سابق للأوردر، وبنعتذر جداً عن أي إزعاج حصل في البداية.`,
      keyQuestion: `طمنا يا فندم، هل الأوردر البديل وصل لحضرتك في أفضل حال، وكل شيء تمام في السخونة والطعم والمكونات؟`,
      closureTamam: `الحمد لله إن الأوردر نال إعجاب حضرتك ورضاك، وهذا هو الأهم عندنا دائماً. بنشكرك جداً على ثقتك فينا وبنتشرف بخدمتك في أي وقت!`,
      closureProblem: `حقك علينا تماماً يا فندم، وبنعتذر بكل صدق. تم تسجيل ملاحظاتك فوراً للإدارة والمطبخ، وهيتواصل مع حضرتك المشرف لتعويضك وتصحيح الأمر فوراً.`,
    };
  }

  // Scenario B: VIP High-Ticket Order
  if (order.totalAmount >= 400) {
    return {
      greeting: `أهلاً بحضرتك يا فندم، مع حضرتك خدمة العملاء في سلسلة مطاعمنا، بتشرف بوجودي مع الأستاذ/ة ${order.customerName}؟`,
      openingPitch: `بنشكر حضرتك لاختيارك لمطعمنا ولطلبك الكريم بقيمة (${order.totalAmount} ج.م)، وحبينا نتأكد بنفسنا إن كل صنف من أصناف الوليمة نال إعجابكم بالكامل.`,
      keyQuestion: `طمنا يا فندم، هل تجربة الأكل ومستوى التغليف وسرعة التوصيل كانت على أعلى مستوى من توقعاتك؟`,
      closureTamam: `سعداء جداً بسماع رأي حضرتك الإيجابي، وألف هنا وشفا لحضرتك ولجميع أفراد العائلة الكريمة!`,
      closureProblem: `نأسف جداً يا فندم لو فيه أي تفصيلة ما كانتش على أكمل وجه. الملاحظة متسجلة بأعلى أولوية وهيتم معالجتها فوراً مع الإدارة.`,
    };
  }

  // Scenario C: Customer with past recorded complaints
  if (pastProblemsCount > 0) {
    return {
      greeting: `مساء الخير يا أستاذ/ة ${order.customerName}، مع حضرتك خدمة العملاء والمتابعة المستمرة من مطاعمنا.`,
      openingPitch: `بنتواصل مع حضرتك للاطمئنان على أوردر اليوم (#${order.orderNumber})، وحرصنا الشديد على إن تجربة اليوم تكون ممتازة وتتلافى أي ملاحظة سابقة.`,
      keyQuestion: `هل كل شيء وصل لحضرتك مظبوط وتام زي ما طلبت بالظبط؟`,
      closureTamam: `فرحتنا كبيرة برضاك النهاردة يا فندم، وثقتك بنا غالية جداً ومستمرين دائماً في تقديم الأفضل لحضرتك!`,
      closureProblem: `حقك محفوظ تماماً، وملاحظتك محل اهتمام مباشر من الإدارة، وهيتم اتخاذ الإجراء اللازم فوراً.`,
    };
  }

  // Scenario D: Standard Routine Follow-Up
  return {
    greeting: `مساء الخير يا فندم، مع حضرتك خدمة العملاء في مطاعمنا، بتشرف بالتواصل مع الأستاذ/ة ${order.customerName}؟`,
    openingPitch: `بنتشرف بطلبك لأوردر اليوم (#${order.orderNumber}) من فرع ${order.branchName}، وبنتطمن في دقيقة سريعة على رضاك التام عن الطلب.`,
    keyQuestion: `طمنا يا فندم، هل كل شيء تمام مع الأوردر وجودة وسخونة الأكل؟`,
    closureTamam: `ألف هنا وشفا يا فندم، بنشكرك جداً على وقتك ونتمنى لحضرتك يوم سعيد!`,
    closureProblem: `حقك علينا يا فندم، بنعتذر جداً وسجلنا تفاصيل المشكلة فوراً لإصلاحها والتواصل مع حضرتك.`,
  };
}
