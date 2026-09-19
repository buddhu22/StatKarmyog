/**
 * Dashboard — Dynamic Officer Competency Development Hub for STATKARMAYOG.
 *
 * Fetches real dynamic data from backend API for whichever officer is logged in.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Table,
  Tag,
  Progress,
  Typography,
  Button,
  Skeleton,
} from 'antd';
import {
  DashboardOutlined,
  BookOutlined,
  RiseOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getOfficerProfile,
  getGapAnalysis,
  getRecommendations,
  getPassportSummary,
  getOfficerArtifacts,
  getAssessmentHistory,
} from '../api/client';

const { Title, Text, Paragraph } = Typography;

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const officerId = user?.officer_id || 'OFF001';

  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);
  const [profile, setProfile] = useState(null);
  const [gapsData, setGapsData] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [passport, setPassport] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [assessments, setAssessments] = useState([]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [profRes, gapsRes, recsRes, passRes, artifactsRes, assessmentsRes] = await Promise.all([
        getOfficerProfile(officerId),
        getGapAnalysis(officerId),
        getRecommendations(officerId),
        getPassportSummary(officerId),
        getOfficerArtifacts(officerId),
        getAssessmentHistory(officerId),
      ]);

      setProfile(profRes.data);
      setGapsData(gapsRes.data?.gaps || []);
      setRecommendations(recsRes.data || []);
      setPassport(passRes.data);
      setArtifacts(artifactsRes.data || []);
      setAssessments(assessmentsRes.data || []);
      setIsMockData(Boolean(profRes.isMock || gapsRes.isMock || recsRes.isMock || passRes.isMock || artifactsRes.isMock || assessmentsRes.isMock));
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [officerId]);

  // Derived KPI metrics from real gap data
  const kpis = useMemo(() => {
    if (!gapsData || gapsData.length === 0) {
      return { current: null, required: null, gap: null, progress: 0 };
    }
    const avgCurrent = Math.round(
      (gapsData.reduce((acc, g) => acc + (g.current_level || g.current || 0), 0) / gapsData.length) * 20
    );
    const avgRequired = Math.round(
      (gapsData.reduce((acc, g) => acc + (g.expected_level || g.required || 0), 0) / gapsData.length) * 20
    );
    const gapSize = Math.max(0, avgRequired - avgCurrent);
    return {
      current: avgCurrent,
      required: avgRequired,
      gap: gapSize,
      progress: Math.min(100, Math.round((avgCurrent / (avgRequired || 1)) * 100)),
    };
  }, [gapsData]);

  const recentSubmittedQuiz = useMemo(
    () => (assessments || []).find((item) => item.attempted_on && item.raw_score_percent !== null),
    [assessments]
  );

  // Derived radar data from real skill gaps
  const radarData = useMemo(() => {
    if (!gapsData || gapsData.length === 0) return [];
    return gapsData.slice(0, 6).map((g) => ({
      subject: g.skill || g.skill_label || 'Competency',
      current: Math.round((g.current_level || g.current || 1) * 20),
      required: Math.round((g.expected_level || g.required || 1) * 20),
      fullMark: 100,
    }));
  }, [gapsData]);

  // Table columns for Gap Summary
  const gapColumns = [
    {
      title: 'Competency',
      dataIndex: 'skill',
      key: 'skill',
      render: (text, record) => (
        <div>
          <Text strong style={{ color: '#0B2641', fontSize: 14 }}>
            {text || record.skill_label}
          </Text>
          <div style={{ fontSize: 11, color: '#617487' }}>Source: {record.score_source || 'DB'}</div>
        </div>
      ),
    },
    {
      title: 'Required',
      dataIndex: 'expected_level',
      key: 'expected_level',
      align: 'center',
      render: (val) => <Text style={{ fontWeight: 600, color: '#172B3D' }}>{val !== null && val !== undefined ? `${Math.round(val * 20)}%` : 'Not available'}</Text>,
    },
    {
      title: 'Current',
      dataIndex: 'current_level',
      key: 'current_level',
      align: 'center',
      render: (val) => <Text style={{ fontWeight: 600, color: '#2966A3' }}>{val !== null && val !== undefined ? `${Math.round(val * 20)}%` : 'Not assessed'}</Text>,
    },
    {
      title: 'Gap',
      dataIndex: 'gap_size',
      key: 'gap_size',
      align: 'center',
      render: (gap) => {
        const gapPts = gap ? Math.round(gap * 20) : 0;
        return (
          <Text style={{ fontWeight: 700, color: gapPts > 20 ? '#CF1322' : gapPts > 10 ? '#BA7517' : '#3D7D70' }}>
            {gapPts > 0 ? `${gapPts} pts` : 'Closed'}
          </Text>
        );
      },
    },
    {
      title: 'Confidence',
      dataIndex: 'confidence_level',
      key: 'confidence_level',
      align: 'center',
      render: (conf) => <Tag style={{ backgroundColor: '#D1E0EE', color: '#0B2641', borderColor: '#B3CDE0', borderRadius: 999 }}>{conf || 'High'}</Tag>,
    },
  ];

  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0B2641] to-[#2966A3] p-6 text-white shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-2xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/15 text-[#D1E0EE]">
                Official Statistical System
              </span>
              {isMockData && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400/20 text-amber-200">
                  Demo Simulation Data
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white m-0">
              Good Morning, {profile?.name || user?.name || 'Officer'}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#D1E0EE] max-w-2xl">
              Role: <strong className="text-white">{profile?.designation || user?.designation}</strong> &bull; Department: <strong className="text-white">{profile?.department || user?.department}</strong>
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button
              type="primary"
              icon={<SafetyCertificateOutlined />}
              onClick={() => navigate('/passport')}
              className="!h-11 !rounded-xl !border-none !bg-white !px-5 !text-sm !font-semibold !text-[#0B2641] shadow-md hover:!bg-[#D1E0EE]"
            >
              View Competency Passport
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchDashboardData}
              className="!h-11 !rounded-xl !border-white/30 !bg-white/10 !px-4 !text-sm !font-medium !text-white hover:!bg-white/20 hover:!border-white/50"
            >
              Sync
            </Button>
          </div>
        </div>
      </div>

      {/* TOP 4 DYNAMIC KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#DCE7F0] bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <Text type="secondary" className="block text-xs font-bold uppercase tracking-wider !text-[#617487]">
            CURRENT COMPETENCY
          </Text>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold text-[#0B2641]">
              {kpis.current === null ? 'Not assessed' : `${kpis.current}%`}
            </span>
            <span className="text-xs font-semibold text-[#2966A3]">Overall</span>
          </div>
          <Progress percent={kpis.current || 0} strokeColor="#2966A3" showInfo={false} size="small" className="mt-3" />
        </div>

        <div className="rounded-2xl border border-[#DCE7F0] bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <Text type="secondary" className="block text-xs font-bold uppercase tracking-wider !text-[#617487]">
            REQUIRED COMPETENCY
          </Text>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold text-[#172B3D]">
              {kpis.required === null ? 'Not available' : `${kpis.required}%`}
            </span>
            <span className="text-xs font-semibold text-[#617487]">Target Level</span>
          </div>
          <Progress percent={kpis.required || 0} strokeColor="#172B3D" showInfo={false} size="small" className="mt-3" />
        </div>

        <div className="rounded-2xl border-l-4 border-l-[#BA7517] border border-[#DCE7F0] bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <Text type="secondary" className="block text-xs font-bold uppercase tracking-wider !text-[#617487]">
            COMPETENCY GAP
          </Text>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold text-[#BA7517]">
              {kpis.gap === null ? 'Not available' : `${kpis.gap}%`}
            </span>
            <span className="text-xs font-semibold text-[#BA7517]">Points to Target</span>
          </div>
          <p className="mt-2 text-[11px] text-[#617487] leading-relaxed">
            Live weighted calculation (60% Quiz / 40% Artifact)
          </p>
        </div>

        <div className="rounded-2xl border-l-4 border-l-[#3D7D70] border border-[#DCE7F0] bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <Text type="secondary" className="block text-xs font-bold uppercase tracking-wider !text-[#617487]">
            WORK ARTIFACTS
          </Text>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold text-[#3D7D70]">
              {artifacts.length}
            </span>
            <span className="text-xs font-semibold text-[#3D7D70]">Role Artifacts</span>
          </div>
          <p className="mt-2 text-[11px] text-[#617487] leading-relaxed">
            Assigned official evidence outputs
          </p>
        </div>
      </div>

      {/* QUICK STATUS SNAPSHOT GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#DCE7F0] bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <Text strong className="text-xs font-bold uppercase tracking-wider !text-[#0B2641]">
                TOP IDENTIFIED GAPS
              </Text>
              <Button type="link" size="small" onClick={() => navigate('/gaps')} className="!p-0 !text-xs !text-[#2966A3] !font-semibold">
                View All &rarr;
              </Button>
            </div>
            <div className="space-y-2.5">
              {gapsData.slice(0, 3).map((gap) => (
                <div key={gap.skill} className="flex items-center justify-between text-xs py-1 border-b border-[#F1F6FA] last:border-none">
                  <span className="font-medium text-[#172B3D] truncate max-w-[180px]">{gap.skill}</span>
                  <Tag color={gap.gap_size * 20 > 40 ? 'red' : gap.gap_size * 20 > 25 ? 'volcano' : 'orange'} className="!m-0 !font-semibold">
                    {Math.round(gap.current_level * 20)}% (Gap: {Math.round(gap.gap_size * 20)}pt)
                  </Tag>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#DCE7F0] bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <Text strong className="block text-xs font-bold uppercase tracking-wider !text-[#0B2641] mb-2">
              ACTIVE WORK ARTIFACTS
            </Text>
            <h3 className="text-xl font-bold text-[#0B2641] m-0">
              {artifacts.length} Assigned Tasks
            </h3>
            <p className="mt-1 text-xs text-[#617487]">
              Submit work documents to automatically prove applied statistical competence.
            </p>
          </div>
          <Button
            type="primary"
            icon={<EyeOutlined />}
            onClick={() => navigate('/artifacts')}
            className="!mt-4 !h-10 !w-full !rounded-xl !bg-[#2966A3] !font-semibold hover:!bg-[#0B2641]"
          >
            Explore Work Artifacts
          </Button>
        </div>

        <div className="rounded-2xl border border-[#DCE7F0] bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <Text strong className="block text-xs font-bold uppercase tracking-wider !text-[#0B2641] mb-2">
              LATEST ASSESSMENT
            </Text>
            <h4 className="text-sm font-bold text-[#172B3D] truncate m-0">
              {recentSubmittedQuiz?.quiz_source_material || 'No submitted quiz yet'}
            </h4>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xl font-bold text-[#2966A3]">
                {recentSubmittedQuiz?.raw_score_percent !== undefined && recentSubmittedQuiz?.raw_score_percent !== null ? `${recentSubmittedQuiz.raw_score_percent}%` : 'Pending'}
              </span>
              <span className="text-xs text-[#617487]">Latest quiz score</span>
            </div>
          </div>
          <Button
            icon={<RocketOutlined />}
            onClick={() => navigate('/quiz')}
            className="!mt-4 !h-10 !w-full !rounded-xl !border-[#2966A3] !font-semibold !text-[#2966A3] hover:!bg-[#F1F6FA]"
          >
            Generate AI Quiz
          </Button>
        </div>
      </div>

      {/* RADAR CHART & DYNAMIC GAP SUMMARY TABLE */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col rounded-2xl border border-[#DCE7F0] bg-white p-4 shadow-sm sm:p-5 lg:col-span-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D1E0EE] text-[#0B2641]">
              <RiseOutlined />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0B2641] m-0">Competency Radar Overview</h3>
              <p className="text-[11px] text-[#617487] m-0">Required vs Current distribution</p>
            </div>
          </div>

          <div className="h-[280px] w-full shrink-0 sm:h-[320px] lg:h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#E8F0F7" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#465C70', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#DCE7F0" />
                <Radar name="Current Level" dataKey="current" stroke="#2966A3" fill="#2966A3" fillOpacity={0.4} />
                <Radar name="Required Level" dataKey="required" stroke="#BA7517" fill="#BA7517" fillOpacity={0.15} />
                <Tooltip />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex min-w-0 flex-col rounded-2xl border border-[#DCE7F0] bg-white p-4 shadow-sm sm:p-5 lg:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D1E0EE] text-[#0B2641]">
                <DashboardOutlined />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0B2641] m-0">Dynamic Competency Gap Summary</h3>
                <p className="text-[11px] text-[#617487] m-0">FRAC framework diagnostic</p>
              </div>
            </div>
            <Button type="link" onClick={() => navigate('/gaps')} className="!p-0 !text-xs !text-[#2966A3] !font-semibold">
              Full Diagnostic &rarr;
            </Button>
          </div>

          <div className="max-h-[320px] min-h-0 overflow-auto rounded-xl border border-[#F1F6FA] sm:max-h-[360px] lg:max-h-[360px]">
            <Table
              dataSource={gapsData}
              columns={gapColumns}
              pagination={false}
              size="middle"
              scroll={{ x: 620 }}
              sticky
              rowKey={(r) => r.skill || r.skill_label || Math.random()}
              onRow={() => ({
                onClick: () => navigate('/gaps'),
                style: { cursor: 'pointer' },
              })}
            />
          </div>
        </div>
      </div>

      {/* RECOMMENDED COURSES FROM BACKEND SEMANTIC SEARCH */}
      <div className="rounded-2xl border border-[#DCE7F0] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D1E0EE] text-[#0B2641]">
              <BookOutlined />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0B2641] m-0">ChromaDB Semantic Course Recommendations</h3>
              <p className="text-[11px] text-[#617487] m-0">Personalized iGOT / NSSTA learning modules</p>
            </div>
          </div>
          <Button type="link" onClick={() => navigate('/learning')} className="!p-0 !text-xs !text-[#2966A3] !font-semibold">
            All Recommendations &rarr;
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recommendations.slice(0, 3).map((rec, idx) => (
            <div
              key={rec.course_id || idx}
              className="rounded-xl border border-[#DCE7F0] bg-[#F8FBFD] p-4 flex flex-col justify-between transition-all hover:border-[#2966A3]/40 hover:bg-[#F1F6FA]"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-[#0B2641] bg-[#D1E0EE] px-2 py-0.5 rounded">
                    {rec.course_id}
                  </span>
                  <Tag color="green" className="!m-0 !text-[11px] !font-semibold">
                    Match: {Math.round((rec.final_score || 0.85) * 100)}%
                  </Tag>
                </div>

                <h4 className="text-sm font-bold text-[#0B2641] line-clamp-2 mt-1 mb-2">
                  {rec.course_title}
                </h4>

                <p className="text-xs text-[#617487] line-clamp-2 mb-3">
                  Matched Skills: {(rec.matched_skills || []).join(', ') || 'Official Statistical Operations'}
                </p>
              </div>

              <Button
                type="primary"
                size="middle"
                icon={<RocketOutlined />}
                onClick={() => navigate('/igot')}
                className="!h-9 !w-full !rounded-lg !bg-[#2966A3] !text-xs !font-semibold hover:!bg-[#0B2641]"
              >
                Start Learning Module
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
