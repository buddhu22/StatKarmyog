/**
 * QuizPage — AI Quiz Generator, MCQ Interface & Before/After Re-Assessment Result.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Row,
  Col,
  Card,
  Typography,
  Select,
  Radio,
  Button,
  Progress,
  Space,
  Tag,
  Alert,
  Upload,
  Result,
  message,
  Table,
  Empty,
  Skeleton,
} from 'antd';
import {
  ThunderboltOutlined,
  FilePdfOutlined,
  LoadingOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
  HistoryOutlined,
  CheckCircleFilled,
  FileTextOutlined,
  DatabaseOutlined,
  RobotOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { generateQuizApi, submitQuizApi, getGapAnalysis, getAssessmentHistory } from '../api/client';
import { useAuth } from '../context/AuthContext';

const { Title, Text, Paragraph } = Typography;

export default function QuizPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const officerId = user?.officer_id || 'OFF001';
  const requestedCompetency = searchParams.get('competency') || '';
  const requestedArtifactId = searchParams.get('artifact_id') || '';

  // State workflow: 'generator' | 'generating' | 'quiz' | 'result'
  const [stage, setStage] = useState('generator');
  const [generationStep, setGenerationStep] = useState(0);

  // Form selections
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [selectedCompetency, setSelectedCompetency] = useState('');
  const [competencyOptions, setCompetencyOptions] = useState([]);
  const [loadingGaps, setLoadingGaps] = useState(true);
  const [fileList, setFileList] = useState([]);

  // Quiz state
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [submitResult, setSubmitResult] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [quizHistory, setQuizHistory] = useState([]);

  const isMyQuizzesRoute = location.pathname === '/my-quizzes';

  const generationStages = [
    {
      title: 'Source ready',
      detail: fileList.length > 0 ? fileList[0].name : 'Assessment brief prepared',
      icon: fileList.length > 0 ? <FileTextOutlined /> : <SafetyCertificateOutlined />,
    },
    {
      title: 'Reading material',
      detail: 'Extracting document text',
      icon: <FileTextOutlined />,
    },
    {
      title: 'Finding concepts',
      detail: 'Mapping evidence to competencies',
      icon: <DatabaseOutlined />,
    },
    {
      title: 'Writing questions',
      detail: 'LLM is shaping the MCQs',
      icon: <RobotOutlined />,
    },
    {
      title: 'Final review',
      detail: 'Checking answers and tags',
      icon: <TagsOutlined />,
    },
  ];

  useEffect(() => {
    if (isMyQuizzesRoute) {
      setStage('history');
    } else if (stage === 'history') {
      setStage('generator');
    }
  }, [isMyQuizzesRoute]);

  const fetchQuizHistory = async () => {
    setHistoryLoading(true);
    const res = await getAssessmentHistory(officerId);
    setHistoryError(Boolean(res.error));
    setQuizHistory(res.data || []);
    setHistoryLoading(false);
  };

  useEffect(() => {
    fetchQuizHistory();
  }, [officerId]);

  // Fetch officer-specific competency gaps for target competency selection
  useEffect(() => {
    async function fetchOfficerGaps() {
      setLoadingGaps(true);
      try {
        const res = await getGapAnalysis(officerId);
        const gaps = res.data?.gaps || [];
        if (gaps.length > 0) {
          const opts = gaps.map((g) => ({
            value: g.skill,
            label: `${g.skill} (Gap: ${g.gap_size} pts)`,
          }));
          if (requestedCompetency && !opts.some((item) => item.value === requestedCompetency)) {
            opts.unshift({ value: requestedCompetency, label: `${requestedCompetency} (from work artifact)` });
          }
          setCompetencyOptions(opts);
          setSelectedCompetency(requestedCompetency || opts[0].value);
        } else {
          const fallbackOpts = [
            { value: 'Survey Design', label: 'Survey Design' },
            { value: 'Sampling', label: 'Sampling' },
            { value: 'Data Quality Frameworks', label: 'Data Quality Frameworks' },
            { value: 'Industrial Statistics', label: 'Industrial Statistics' },
          ];
          if (requestedCompetency && !fallbackOpts.some((item) => item.value === requestedCompetency)) {
            fallbackOpts.unshift({ value: requestedCompetency, label: `${requestedCompetency} (from work artifact)` });
          }
          setCompetencyOptions(fallbackOpts);
          setSelectedCompetency(requestedCompetency || fallbackOpts[0].value);
        }
      } catch (err) {
        console.error('[QuizPage] Failed to fetch officer gaps:', err);
      } finally {
        setLoadingGaps(false);
      }
    }
    fetchOfficerGaps();
  }, [officerId, requestedCompetency]);

  const handleGenerateQuiz = async () => {
    setStage('generating');
    setGenerationStep(0);

    const stepTimer1 = setTimeout(() => setGenerationStep(1), 600);
    const stepTimer2 = setTimeout(() => setGenerationStep(2), 1200);
    const stepTimer3 = setTimeout(() => setGenerationStep(3), 1800);
    const stepTimer4 = setTimeout(() => setGenerationStep(4), 2400);

    try {
      const formData = new FormData();
      if (fileList.length > 0) {
        formData.append('file', fileList[0].originFileObj || fileList[0]);
      }
      const difficultyMap = { Basic: 'easy', Intermediate: 'medium', Advanced: 'hard' };
      formData.append('difficulty', difficultyMap[difficulty] || 'medium');
      formData.append('language', 'en');
      formData.append('num_questions', String(numQuestions));
      formData.append('officer_id', officerId);
      if (selectedCompetency) {
        formData.append('target_competency', selectedCompetency);
      }
      if (requestedArtifactId) {
        formData.append('artifact_id', requestedArtifactId);
      }

      const res = await generateQuizApi(formData);

      if (res.error || !res.data?.attempt_id || !Array.isArray(res.data?.questions)) {
        message.error(res.message || 'Quiz generation failed. Please try another learning material or reduce the number of questions.', 6);
        setStage('generator');
        return;
      }

      setAttemptId(res.data.attempt_id);
      setQuestions(res.data.questions);
      setUserAnswers({});
      setCurrentQIndex(0);
      setStage('quiz');
      message.success('AI Quiz generated successfully!');
    } catch (err) {
      console.error('[QuizPage] Error in quiz generation:', err);
      message.error(`An unexpected error occurred: ${err.message || err}`, 6);
      setStage('generator');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      clearTimeout(stepTimer4);
    }
  };

  const handleOptionSelect = (qId, optionKey) => {
    setUserAnswers((prev) => ({ ...prev, [qId]: optionKey }));
  };

  const handleSubmitQuiz = async () => {
    const payload = {
      attempt_id: attemptId,
      officer_id: officerId,
      answers: questions.map((_, index) => userAnswers[index]),
    };
    if (!attemptId || payload.answers.some((answer) => answer === undefined)) {
      message.warning('Please answer every question before submitting.');
      return;
    }
    try {
      const res = await submitQuizApi(payload);
      if (res.error || !res.data) {
        const errorMsg = res.message || 'Quiz submission failed. No competency score was recorded.';
        message.error(errorMsg, 6);
        return;
      }
      setSubmitResult(res.data);
      setStage('result');
      fetchQuizHistory();
      message.success('Quiz submitted! Competency Passport score updated.');
    } catch (err) {
      console.error('[QuizPage] Submission error:', err);
      message.error(`Submission error: ${err.message || err}`, 6);
    }
  };

  const historyRows = useMemo(() => {
    return (quizHistory || []).map((attempt) => ({
      key: attempt.attempt_id,
      attempt_id: attempt.attempt_id,
      title: attempt.quiz_source_material,
      target: attempt.target_competency || (attempt.competencies || []).join(', ') || 'Not tagged',
      question_count: attempt.question_count,
      status: attempt.status,
      score: attempt.raw_score_percent,
      submitted_on: attempt.attempted_on,
      course_id: attempt.course_id,
      artifact_id: attempt.artifact_id,
    }));
  }, [quizHistory]);

  const historyColumns = [
    {
      title: 'Quiz',
      dataIndex: 'title',
      key: 'title',
      render: (title, record) => (
        <div>
          <Text strong style={{ color: '#0B2641' }}>{title}</Text>
          <div style={{ fontSize: 11, color: '#617487' }}>{record.attempt_id}</div>
        </div>
      ),
    },
    {
      title: 'Target Competency',
      dataIndex: 'target',
      key: 'target',
      render: (target) => <Text style={{ color: '#172B3D' }}>{target}</Text>,
    },
    {
      title: 'Questions',
      dataIndex: 'question_count',
      key: 'question_count',
      align: 'center',
      render: (count) => (
        <Tag style={{ backgroundColor: '#D1E0EE', color: '#0B2641', borderColor: '#B3CDE0', borderRadius: 999 }}>
          {count || 0}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      render: (status) => (
        <Tag color={status === 'submitted' ? 'green' : 'gold'}>
          {status === 'submitted' ? 'Submitted' : 'Generated'}
        </Tag>
      ),
    },
    {
      title: 'Score',
      dataIndex: 'score',
      key: 'score',
      align: 'center',
      render: (score) => (
        <Text strong style={{ color: score === null || score === undefined ? '#617487' : '#2966A3' }}>
          {score === null || score === undefined ? 'Pending' : `${score}%`}
        </Text>
      ),
    },
    {
      title: 'Submitted',
      dataIndex: 'submitted_on',
      key: 'submitted_on',
      align: 'center',
      render: (date) => <Text style={{ color: '#465C70' }}>{date || 'Not submitted'}</Text>,
    },
    {
      title: 'Linked To',
      key: 'linked_to',
      render: (_, record) => (
        <Space wrap size={4}>
          {record.course_id && <Tag>{record.course_id}</Tag>}
          {record.artifact_id && <Tag color="purple">{record.artifact_id}</Tag>}
          {!record.course_id && !record.artifact_id && (
            <Text type="secondary" style={{ fontSize: 12 }}>Competency assessment</Text>
          )}
        </Space>
      ),
    },
  ];

  const renderMyQuizzes = () => (
    <Card
      title={
        <Space>
          <HistoryOutlined style={{ color: '#2966A3' }} />
          <span style={{ color: '#0B2641', fontWeight: 600 }}>My Quiz Attempts</span>
        </Space>
      }
      extra={<Button icon={<ReloadOutlined />} onClick={fetchQuizHistory} className="border-[#DCE7F0]">Refresh</Button>}
      bordered={false}
      className="!mt-0 !overflow-hidden rounded-2xl border border-[#DCE7F0] bg-white shadow-sm"
    >
      {historyError && (
        <Alert
          type="error"
          showIcon
          message="Could not load your quizzes"
          description="Please check the backend connection and refresh this section."
          style={{ marginBottom: 16 }}
        />
      )}
      {historyLoading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : historyRows.length === 0 ? (
        <Empty description="No quizzes attempted yet." />
      ) : (
        <div className="-mx-2 overflow-x-auto sm:mx-0">
          <Table
            dataSource={historyRows}
            columns={historyColumns}
            pagination={{ pageSize: 5, responsive: true }}
            scroll={{ x: 850 }}
            size="middle"
          />
        </div>
      )}
    </Card>
  );

  return (
    <div className="w-full max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-5 sm:space-y-6">
      {/* Generate Quiz route only */}
      {!isMyQuizzesRoute && stage === 'generator' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#DCE7F0] bg-gradient-to-r from-[#0B2641] to-[#2966A3] p-5 sm:p-8 text-white shadow-sm">
            <div className="inline-flex max-w-full items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-3">
              <ThunderboltOutlined /> MoSPI AI Learning Engine
            </div>
            <Title level={3} className="!text-xl sm:!text-2xl" style={{ margin: 0, color: '#ffffff' }}>
              AI Competency Quiz Generator
            </Title>
            <Paragraph style={{ color: '#D1E0EE', marginTop: 8, marginBottom: 0, fontSize: 14 }}>
              Generate validated MCQs from uploaded training materials, identified officer competency gaps, or assigned statistical work artifacts.
            </Paragraph>
          </div>

          <Card bordered={false} className="rounded-2xl border border-[#DCE7F0] bg-white !p-0 shadow-sm">
            <Space direction="vertical" style={{ width: '100%' }} size={20} className="p-4 sm:p-6">
              <div>
                <Text strong style={{ color: '#0B2641', fontSize: 14 }}>1. Target Competency ({user?.name || officerId}):</Text>
                <Select
                  value={selectedCompetency}
                  onChange={setSelectedCompetency}
                  loading={loadingGaps}
                  style={{ width: '100%', marginTop: 8 }}
                  options={competencyOptions}
                  size="large"
                />
              </div>

              <div>
                <Text strong style={{ color: '#0B2641', fontSize: 14 }}>2. Number of Questions:</Text>
                <div style={{ marginTop: 8 }}>
                  <Radio.Group className="!flex !flex-wrap !gap-2" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)} buttonStyle="solid" size="middle">
                    <Radio.Button value={5}>5 Questions</Radio.Button>
                    <Radio.Button value={10}>10 Questions</Radio.Button>
                    <Radio.Button value={15}>15 Questions</Radio.Button>
                    <Radio.Button value={20}>20 Questions</Radio.Button>
                  </Radio.Group>
                </div>
              </div>

              <div>
                <Text strong style={{ color: '#0B2641', fontSize: 14 }}>3. Difficulty Level:</Text>
                <div style={{ marginTop: 8 }}>
                  <Radio.Group className="!flex !flex-wrap !gap-2" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} buttonStyle="solid" size="middle">
                    <Radio.Button value="Basic">Easy / Foundation</Radio.Button>
                    <Radio.Button value="Intermediate">Intermediate</Radio.Button>
                    <Radio.Button value="Advanced">Advanced</Radio.Button>
                  </Radio.Group>
                </div>
              </div>

              <div>
                <Text strong style={{ color: '#0B2641', fontSize: 14 }}>4. Learning Material Source (Optional):</Text>
                <Upload.Dragger
                  accept=".pdf,.docx,.txt,.md"
                  maxCount={1}
                  beforeUpload={() => false}
                  fileList={fileList}
                  onChange={({ fileList: nextFileList }) => setFileList(nextFileList.slice(-1))}
                  style={{ marginTop: 8, padding: 16, borderRadius: 12, backgroundColor: '#F8FBFD', borderColor: '#DCE7F0' }}
                >
                  <p className="ant-upload-drag-icon">
                    <FilePdfOutlined style={{ fontSize: 36, color: '#2966A3' }} />
                  </p>
                  <p className="ant-upload-text font-medium text-[#0B2641]" style={{ fontSize: 14 }}>Click or drag learning document to generate MCQs</p>
                  <p className="text-xs text-[#617487] mt-1">Supports PDF, DOCX, TXT, MD up to 10MB</p>
                </Upload.Dragger>
                {requestedArtifactId && (
                  <Tag color="blue" style={{ marginTop: 10 }}>
                    Linked Artifact: {requestedArtifactId}
                  </Tag>
                )}
              </div>

              <Button
                type="primary"
                size="large"
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateQuiz}
                className="!mt-2 !h-12 !w-full !rounded-xl !bg-[#2966A3] !text-sm !font-semibold !text-white hover:!bg-[#0B2641]"
              >
                Generate Assessment Quiz
              </Button>
            </Space>
          </Card>
        </div>
      )}

      {/* Quiz History route only */}
      {isMyQuizzesRoute && renderMyQuizzes()}

      {/* Stage 2: GENERATION PROCESS STEPPER */}
      {stage === 'generating' && (
        <Card bordered={false} className="quiz-roadmap-card rounded-2xl border border-[#DCE7F0] bg-white px-4 py-8 shadow-sm sm:px-8 sm:py-10">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#EAF3FA] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#2966A3]">
              <LoadingOutlined /> Live generation pipeline
            </div>
            <Title level={4} style={{ color: '#0B2641', marginBottom: 8 }}>
              Building your {numQuestions}-question assessment
            </Title>
            <Paragraph className="!mx-auto !mb-8 !max-w-xl !text-sm !leading-6 !text-[#617487]">
              The material is moving through the competency engine for <strong>{selectedCompetency}</strong>. Each stage lights up as it is completed.
            </Paragraph>

            <div className="quiz-roadmap" aria-label="Quiz generation progress">
              <div className="quiz-roadmap-track" aria-hidden="true">
                <div
                  className="quiz-roadmap-track-fill"
                  style={{ width: `${Math.min((generationStep / (generationStages.length - 1)) * 100, 100)}%` }}
                />
              </div>
              <div className="quiz-roadmap-stages">
                {generationStages.map((stageItem, index) => {
                  const isComplete = index < generationStep;
                  const isActive = index === generationStep;
                  return (
                    <div
                      key={stageItem.title}
                      className={`quiz-roadmap-stage ${isComplete ? 'is-complete' : ''} ${isActive ? 'is-active' : ''}`}
                    >
                      <div className="quiz-roadmap-node">
                        {isComplete ? <CheckCircleFilled /> : stageItem.icon}
                      </div>
                      <div className="mt-3 text-xs font-bold text-[#0B2641]">{stageItem.title}</div>
                      <div className="mt-1 hidden text-[11px] leading-4 text-[#8AA0B2] sm:block">{stageItem.detail}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="quiz-roadmap-status mt-9 flex items-center gap-3 rounded-xl border border-[#DCE7F0] bg-[#F8FBFD] px-4 py-3 text-left">
              <span className="quiz-roadmap-pulse flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2966A3] text-white">
                {generationStages[generationStep]?.icon || <LoadingOutlined />}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#2966A3]">
                  Now processing
                </div>
                <div className="truncate text-sm font-medium text-[#172B3D]">
                  {generationStages[generationStep]?.detail || 'Packaging your assessment'}
                </div>
              </div>
              <div className="ml-auto shrink-0 text-xs font-semibold text-[#617487]">
                {Math.min(Math.round(((generationStep + 1) / generationStages.length) * 100), 99)}%
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Stage 3: MCQ QUIZ INTERFACE */}
      {stage === 'quiz' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
            <div>
              <span className="text-xs font-semibold text-[#2966A3] uppercase tracking-wider">Assessment in Progress</span>
              <Title level={4} style={{ margin: 0, color: '#0B2641' }}>
                {selectedCompetency}
              </Title>
            </div>
            <Tag style={{ backgroundColor: '#D1E0EE', color: '#0B2641', borderColor: '#B3CDE0', borderRadius: 999, padding: '4px 12px', fontWeight: 600 }}>
              Question {currentQIndex + 1} of {questions.length}
            </Tag>
          </div>

          <Progress percent={((currentQIndex + 1) / questions.length) * 100} strokeColor="#2966A3" showInfo={false} />

          <Card bordered={false} className="rounded-2xl border border-[#DCE7F0] bg-white p-2 sm:p-4 shadow-sm">
            <div className="text-base sm:text-lg font-semibold text-[#172B3D] mb-6">
              <span className="text-[#2966A3] mr-2">Q{currentQIndex + 1}.</span> {questions[currentQIndex]?.question}
            </div>

            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              {questions[currentQIndex]?.options?.map((opt, optionIndex) => {
                const isSelected = userAnswers[currentQIndex] === optionIndex;
                return (
                  <div
                    key={optionIndex}
                    onClick={() => handleOptionSelect(currentQIndex, optionIndex)}
                    className={`p-4 rounded-xl cursor-pointer transition-all duration-150 flex items-start gap-3 border ${
                      isSelected
                        ? 'border-[#2966A3] bg-[#F0F7FF] text-[#0B2641] shadow-xs'
                        : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#334155]'
                    }`}
                  >
                    <span className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 mt-0.5 ${
                      isSelected ? 'bg-[#2966A3] text-white' : 'bg-[#E2E8F0] text-[#475569]'
                    }`}>
                      {String.fromCharCode(65 + optionIndex)}
                    </span>
                    <span className={`text-sm sm:text-base leading-relaxed ${isSelected ? 'font-semibold text-[#0B2641]' : 'text-[#172B3D]'}`}>
                      {opt}
                    </span>
                  </div>
                );
              })}
            </Space>
          </Card>

          <div className="flex items-center justify-between pt-2">
            <Button
              disabled={currentQIndex === 0}
              onClick={() => setCurrentQIndex((i) => i - 1)}
              size="large"
              className="border-[#DCE7F0]"
            >
              Previous
            </Button>

            {currentQIndex < questions.length - 1 ? (
              <Button type="primary" onClick={() => setCurrentQIndex((i) => i + 1)} size="large" style={{ background: '#2966A3' }}>
                Next Question
              </Button>
            ) : (
              <Button type="primary" onClick={handleSubmitQuiz} size="large" style={{ background: '#3D7D70', borderColor: '#3D7D70' }}>
                Submit Assessment
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Stage 4: QUIZ RESULT & BEFORE / AFTER RE-ASSESSMENT */}
      {stage === 'result' && (
        <Card bordered={false} className="rounded-2xl border border-[#DCE7F0] bg-white shadow-sm text-center p-6 sm:p-8">
          <Result
            status="success"
            title={<span style={{ color: '#0B2641', fontWeight: 700, fontSize: 22 }}>Quiz Completed & Score Recorded!</span>}
            subTitle={<span style={{ color: '#465C70' }}>Competency evaluated: <strong>{selectedCompetency}</strong></span>}
          />

          <Row gutter={[16, 16]} justify="center" style={{ marginTop: 12, marginBottom: 28 }}>
            <Col xs={24} md={18}>
              <div className="bg-[#F8FBFD] p-6 rounded-2xl border border-[#DCE7F0]">
                <Row gutter={16} align="middle">
                  <Col xs={8}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Quiz Score</Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#2966A3', marginTop: 4 }}>
                      {submitResult?.score_summary?.[0]?.quiz_score ? `${Math.round(submitResult.score_summary[0].quiz_score * 20)}%` : 'Recorded'}
                    </div>
                  </Col>
                  <Col xs={8}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Combined Score</Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#0B2641', marginTop: 4 }}>
                      {submitResult?.score_summary?.[0]?.combined_score ? `${Math.round(submitResult.score_summary[0].combined_score * 20)}%` : 'Recorded'}
                    </div>
                  </Col>
                  <Col xs={8}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Passport Status</Text>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#3D7D70', marginTop: 4 }}>
                      Updated
                    </div>
                  </Col>
                </Row>
              </div>
            </Col>
          </Row>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              type="primary"
              size="large"
              icon={<SafetyCertificateOutlined />}
              onClick={() => navigate('/passport')}
              style={{ background: '#2966A3', height: 44, borderRadius: 8 }}
            >
              View Competency Passport
            </Button>
            <Button
              size="large"
              icon={<HistoryOutlined />}
              onClick={() => {
                setStage('generator');
                fetchQuizHistory();
                navigate('/my-quizzes');
              }}
              style={{ height: 44, borderRadius: 8 }}
              className="border-[#DCE7F0]"
            >
              View My Quizzes
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
