export const GRADE = Object.freeze({
    GENERAL: 'C',
    MASTER: 'Master',
    S: 'S',
});

// Keep this matrix synchronized with public.partner_hierarchy_rules.
export const HIERARCHY_RULES = Object.freeze({
    [GRADE.S]: Object.freeze([GRADE.MASTER, GRADE.GENERAL]),
    [GRADE.MASTER]: Object.freeze([GRADE.GENERAL]),
});

export const isTopTier = (grade) => grade === GRADE.S;
export const isMaster = (grade) => grade === GRADE.MASTER;
export const isMasterOrAbove = (grade) => isMaster(grade) || isTopTier(grade);
export const isGeneral = (grade) => grade === GRADE.GENERAL;

export const isAdminRole = (role) => role === 'admin';
export const isLeaderRole = (role) => role === 'leader';
export const isLegacyMasterRole = (role) => role === 'master';

export const lineOf = (role) => {
    if (role === 'leader') return 'leader';
    if (['dealer', 'master', 'morning', 'meal', '아침', '식사'].includes(role)) return 'dealer';
    return null;
};

export const GRADE_LABELS = Object.freeze({
    dealer: Object.freeze({ C: '딜러', Master: '마스터 딜러', S: '딜러 대표마스터' }),
    leader: Object.freeze({ C: '팀장', Master: '마스터 팀장', S: '팀장 대표마스터' }),
});

export const gradeLabel = (role, grade) => {
    const line = lineOf(role);
    return line ? (GRADE_LABELS[line][grade] || GRADE_LABELS[line].C) : (role || '');
};

// A parent and child must be in the same dealer/leader line.
export const canParent = (parentRole, parentGrade, childRole, childGrade) =>
    lineOf(parentRole) === lineOf(childRole) && Boolean(lineOf(parentRole))
        && (HIERARCHY_RULES[parentGrade]?.includes(childGrade) ?? false);
