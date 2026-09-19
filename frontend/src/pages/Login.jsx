/**
 * Login Page — STATKARMAYOG Professional Government-Tech Portal.
 *
 * MoSPI-inspired visual system:
 *   Navy       #0B2641
 *   Official Blue #2966A3
 *   Mist Blue  #D1E0EE
 *   Soft White #F8FBFD
 *
 * Login logic, authentication flow, mock profile selection, and routes are
 * preserved. The page has been visually redesigned with responsive Tailwind
 * utility classes while continuing to use Ant Design form components.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Alert,
  Input,
  Button,
  Typography,
  Space,
  Select,
  Divider,
  message,
} from 'antd';
import {
  LoginOutlined,
  UserOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  ArrowLeftOutlined,
  CheckCircleFilled,
  BarChartOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { waitForBackendReady } from '../api/client';
import { MOCK_OFFICERS } from '../api/client';
import AppHeader from '../components/AppHeader';

const { Title, Text, Paragraph } = Typography;

const COLORS = {
  navy: '#0B2641',
  blue: '#2966A3',
  mist: '#D1E0EE',
  softWhite: '#F8FBFD',
  text: '#172B3D',
  muted: '#617487',
  border: '#DCE7F0',
};

export default function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [officerId, setOfficerId] = useState('OFF001');
  const [password, setPassword] = useState('••••••••');
  const [selectedProfileId, setSelectedProfileId] = useState('OFF001');
  const [loading, setLoading] = useState(false);

  const performLogin = async (targetId) => {
    setLoading(true);
    const idToUse = targetId || officerId || 'OFF001';
    const officer =
      MOCK_OFFICERS.find((o) => o.officer_id === idToUse) || MOCK_OFFICERS[0];
    const userRole = officer.role || 'officer';

    await new Promise((resolve) => setTimeout(resolve, 400));
    const backendReady = await waitForBackendReady();
    if (!backendReady) {
      message.warning({
        content:
          'Service notice: the Render server may be waking up after inactivity. Please wait up to 60 seconds, then try signing in again.',
        duration: 6,
      });
      setLoading(false);
      return;
    }

    setUser({
      officer_id: officer.officer_id,
      name: officer.name,
      designation: officer.designation,
      department: officer.department,
      role: userRole,
    });
    message.success({
      content: `Welcome, ${officer.name}!`,
      duration: 3,
    });
    navigate(userRole === 'admin' ? '/admin' : '/dashboard');
    setLoading(false);
  };

  const benefits = [
    {
      icon: <BarChartOutlined />,
      title: 'Competency intelligence',
      description: 'Understand role-specific skill gaps with measurable evidence.',
    },
    {
      icon: <FileSearchOutlined />,
      title: 'Evidence-based growth',
      description: 'Connect learning progress with real work artifacts.',
    },
    {
      icon: <CheckCircleFilled />,
      title: 'Official ecosystem',
      description: 'Designed for India’s Official Statistical System.',
    },
  ];

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F8FBFD] text-[#172B3D]">
      <AppHeader showUser={false} />

      <main className="relative flex min-h-[calc(100vh-72px)] items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#D1E0EE]/45 blur-3xl" />
          <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[#E8F0F7]/80 blur-3xl" />
        </div>

        <div className="relative grid w-full max-w-6xl overflow-hidden rounded-3xl border border-[#DCE7F0] bg-white shadow-[0_20px_70px_rgba(11,38,65,0.10)] lg:grid-cols-[0.95fr_1.05fr]">
          {/* Brand / information panel */}
          <section className="relative hidden overflow-hidden bg-[#0B2641] px-8 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-12">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[44px] border-[#2966A3]/35" />
            <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full border-[56px] border-[#D1E0EE]/10" />

            <div className="relative">
              <div className="mb-10 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                  <SafetyCertificateOutlined className="text-2xl text-[#D1E0EE]" />
                </div>
                <div>
                  <div className="text-xl font-bold tracking-tight">StatKarmyog</div>
                  <div className="text-xs tracking-[0.18em] text-[#D1E0EE]">
                    SKILL INTELLIGENCE
                  </div>
                </div>
              </div>

              <div className="max-w-md">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#D1E0EE]">
                  Officer access portal
                </p>
                <h1 className="text-3xl font-bold leading-tight xl:text-4xl">
                  Turn learning into measurable competency growth.
                </h1>
                <p className="mt-5 text-sm leading-7 text-[#D1E0EE]">
                  A competency intelligence layer for India’s Official Statistical
                  System, built to connect training, evidence, and professional growth.
                </p>
              </div>

              <div className="mt-10 space-y-5">
                {benefits.map((benefit) => (
                  <div key={benefit.title} className="flex gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#D1E0EE]">
                      {benefit.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{benefit.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#B8CBDC]">
                        {benefit.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mt-12 border-t border-white/15 pt-5 text-xs text-[#B8CBDC]">
              Smart India Hackathon 2026
              <span className="mx-2 text-white/40">•</span>
              SIH26101
            </div>
          </section>

          {/* Login panel */}
          <section className="min-w-0 bg-white px-5 py-8 sm:px-10 sm:py-10 lg:px-12 xl:px-16">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 lg:hidden">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F1F6FA] text-[#0B2641] ring-1 ring-[#D1E0EE]">
                  <SafetyCertificateOutlined className="text-2xl" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#617487]">
                  Officer access portal
                </p>
              </div>

              <div className="mb-8">
                <Title
                  level={2}
                  className="!mb-2 !text-2xl !font-bold !tracking-tight !text-[#0B2641] sm:!text-3xl"
                >
                  Welcome back
                </Title>
                <Paragraph className="!mb-0 !text-sm !leading-6 !text-[#617487]">
                  Sign in to access your competency dashboard and professional growth
                  insights.
                </Paragraph>
              </div>

              <div className="space-y-5">
                <div>
                  <Text strong className="mb-2 block !text-xs !text-[#465C70]">
                    Officer ID
                  </Text>
                  <Input
                    size="large"
                    prefix={<UserOutlined className="!text-[#8AA0B2]" />}
                    placeholder="Enter Officer ID (e.g. OFF001)"
                    value={officerId}
                    onChange={(e) => setOfficerId(e.target.value)}
                    className="!h-12 !rounded-xl !border-[#D1E0EE] hover:!border-[#2966A3] focus:!border-[#2966A3]"
                  />
                </div>

                <div>
                  <Text strong className="mb-2 block !text-xs !text-[#465C70]">
                    Password
                  </Text>
                  <Input.Password
                    size="large"
                    prefix={<LockOutlined className="!text-[#8AA0B2]" />}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="!h-12 !rounded-xl !border-[#D1E0EE] hover:!border-[#2966A3] focus:!border-[#2966A3]"
                  />
                </div>

                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<LoginOutlined />}
                  onClick={() => performLogin(officerId)}
                  loading={loading}
                  className="!h-12 !rounded-xl !border-[#2966A3] !bg-[#2966A3] !text-sm !font-semibold shadow-[0_8px_18px_rgba(41,102,163,0.20)] hover:!border-[#0B2641] hover:!bg-[#0B2641]"
                >
                  Sign in to StatKarmyog
                </Button>
              </div>

              <Divider className="!my-7 !border-[#E8F0F7] !text-[10px] !font-semibold !tracking-[0.16em] !text-[#8AA0B2]">
                PROTOTYPE DEMO ACCESS
              </Divider>

              <div className="rounded-2xl border border-[#BFD7E8] bg-[#EFF7FC] p-4 shadow-[0_8px_24px_rgba(41,102,163,0.06)] sm:p-5">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D1E0EE] text-[#0B2641]">
                    <ThunderboltOutlined />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0B2641]">
                      Quick login profile
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#617487]">
                      Select a demo officer to explore the prototype.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <Select
                    value={selectedProfileId}
                    onChange={(val) => {
                      setSelectedProfileId(val);
                      setOfficerId(val);
                    }}
                    className="!w-full"
                    size="large"
                    options={MOCK_OFFICERS.map((o) => ({
                      value: o.officer_id,
                      label: `${o.name} (${o.designation})`,
                    }))}
                  />

                  <Button
                    block
                    icon={<ThunderboltOutlined />}
                    onClick={() => performLogin(selectedProfileId)}
                    className="!h-11 !rounded-xl !border-[#2966A3] !bg-white !font-semibold !text-[#2966A3] hover:!border-[#0B2641] hover:!bg-[#F1F6FA] hover:!text-[#0B2641]"
                  >
                    Prototype Quick Login
                  </Button>
                </div>
              </div>

              <Alert
                className="!mt-7 !min-h-[132px] !h-auto !w-full !rounded-2xl !border-[#FDA4AF] !bg-[#FFF1F2] !px-4 !py-4 sm:!min-h-[112px] sm:!px-5 [&_.ant-alert-description]:!text-[11px] [&_.ant-alert-description]:!leading-5 [&_.ant-alert-description]:!text-[#9F1239] [&_.ant-alert-message]:!text-xs [&_.ant-alert-message]:!font-semibold [&_.ant-alert-message]:!text-[#881337]"
                icon={<ThunderboltOutlined />}
                message="Service notice"
                description="StatKarmyog is hosted on Render. After inactivity, the first sign-in may take up to 60 seconds while the service wakes up."
                showIcon
                type="warning"
              />

              <div className="mt-7 text-center">
                <Button
                  type="link"
                  size="small"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate('/')}
                  className="!text-xs !font-medium !text-[#2966A3] hover:!text-[#0B2641]"
                >
                  Back to Landing Page
                </Button>

                <p className="mt-3 text-[11px] leading-5 text-[#8AA0B2]">
                  Smart India Hackathon 2026
                  <span className="mx-1.5">•</span>
                  Problem Statement SIH26101
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
