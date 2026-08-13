import api from "./api";
import type { Auditoria } from "../types";

export const listarAuditoria = async (params: { entidad?: string; limit?: number } = {}) =>
  (await api.get<Auditoria[]>("/auditoria", { params })).data;
