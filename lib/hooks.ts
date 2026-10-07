'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './auth-context';
import { supabase } from './supabase';
import { DatasetColumn } from './types';

export interface DatasetRecord {
  id: string;
  name: string;
  source_type: string;
  source_label: string | null;
  row_count: number;
  column_count: number;
  columns: DatasetColumn[];
  rows: Record<string, number | string | null>[];
  is_sample: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export function useDatasets() {
  const { user } = useAuth();
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDatasets = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('datasets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error loading datasets:', error);
    }
    if (data) {
      setDatasets(data as unknown as DatasetRecord[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  const addDataset = useCallback(
    async (dataset: Omit<DatasetRecord, 'id' | 'created_at' | 'updated_at' | 'is_sample' | 'status'> & { is_sample?: boolean }) => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('datasets')
        .insert({
          user_id: user.id,
          name: dataset.name,
          source_type: dataset.source_type,
          source_label: dataset.source_label,
          row_count: dataset.row_count,
          column_count: dataset.column_count,
          columns: dataset.columns,
          rows: dataset.rows,
          is_sample: dataset.is_sample || false,
          status: 'ready',
        })
        .select()
        .single();
      if (error) {
        console.error('Error adding dataset:', error);
        return null;
      }
      // Also create a version snapshot
      if (data) {
        await supabase.from('dataset_versions').insert({
          dataset_id: data.id,
          user_id: user.id,
          version_number: 1,
          row_count: dataset.row_count,
          column_count: dataset.column_count,
          columns: dataset.columns,
          rows: dataset.rows,
          changes_summary: 'Initial upload',
        });
      }
      await loadDatasets();
      return data as unknown as DatasetRecord;
    },
    [user, loadDatasets]
  );

  const deleteDataset = useCallback(
    async (id: string) => {
      await supabase.from('datasets').delete().eq('id', id);
      await loadDatasets();
    },
    [loadDatasets]
  );

  return { datasets, loading, loadDatasets, addDataset, deleteDataset };
}

export function useAnalyses() {
  const { user } = useAuth();
  const [analyses, setAnalyses] = useState<
    { id: string; question: string; status: string; dataset_id: string | null; created_at: string; contract: Record<string, unknown> | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const loadAnalyses = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('analyses')
      .select('id, question, status, dataset_id, created_at, contract')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setAnalyses(data as typeof analyses);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  return { analyses, loading, loadAnalyses };
}

export function useProofs() {
  const { user } = useAuth();
  const [proofs, setProofs] = useState<
    {
      id: string;
      proof_id_serial: string;
      question: string;
      answer: string;
      match: boolean;
      verification_status: string;
      source_dataset: string;
      created_at: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const loadProofs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('proofs')
      .select('id, proof_id_serial, question, answer, match, verification_status, source_dataset, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setProofs(data as typeof proofs);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadProofs();
  }, [loadProofs]);

  return { proofs, loading, loadProofs };
}

export function useAuditLog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<
    { id: string; action: string; entity_type: string | null; details: Record<string, unknown> | null; created_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('audit_logs')
      .select('id, action, entity_type, details, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setLogs(data as typeof logs);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const addLog = useCallback(
    async (action: string, entityType?: string, details?: Record<string, unknown>) => {
      if (!user) return;
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action,
        entity_type: entityType,
        details: details || null,
      });
      await loadLogs();
    },
    [user, loadLogs]
  );

  return { logs, loading, loadLogs, addLog };
}
