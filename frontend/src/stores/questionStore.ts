import { create } from 'zustand';

interface Question {
  id: number;
  content: string;
  plainText?: string;
  questionType?: string;
  difficulty?: string;
  chapterId?: number;
  chapter?: any;
  questionKnowledgePoints?: any[];
  questionTags?: any[];
  createdAt: string;
  updatedAt: string;
}

interface QuestionStore {
  questions: Question[];
  selectedQuestionIds: number[];
  filters: {
    chapterId?: number;
    knowledgePointIds?: number[];
    difficulty?: string;
    questionType?: string;
  };
  setQuestions: (questions: Question[]) => void;
  setSelectedQuestionIds: (ids: number[]) => void;
  setFilters: (filters: any) => void;
  clearFilters: () => void;
}

export const useQuestionStore = create<QuestionStore>((set) => ({
  questions: [],
  selectedQuestionIds: [],
  filters: {},
  setQuestions: (questions) => set({ questions }),
  setSelectedQuestionIds: (ids) => set({ selectedQuestionIds: ids }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  clearFilters: () => set({ filters: {} })
}));
