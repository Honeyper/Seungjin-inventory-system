# 매일 자동 DB 관리

운영 DB의 기존 백업 마지막 실행(한국시간 06:00) 이후에 pg_cron으로 실행합니다. PC나 모바일을 켜 둘 필요가 없습니다.

| 한국시간 | 작업 | 범위 |
| --- | --- | --- |
| 매일 06:30 | 만료 임시 정보 정리 | 만료 후 하루가 지난 앱 세션·백업 인증 토큰, 30일 지난 이 기능의 성공 실행 로그 |
| 매일 06:35 | VACUUM ANALYZE | 재고·입고·제품·발주·백업 대기열·상태·임시 인증 테이블의 내부 공간 재사용 및 조회 통계 갱신 |

재고, 출고 이력, 첨부자료, 백업 대기열과 백업 실행 기록은 삭제하지 않습니다. 만료 정리는 테이블별 최대 1,000건이며 활성 로그인과 유효한 백업 인증 토큰은 유지합니다. 실패한 자동 관리 기록도 유지합니다.

기존 autovacuum을 유지하며 일일 관리로 보완합니다. VACUUM은 FULL 방식이 아니고, TRUNCATE FALSE로 테이블 축소 잠금을 피합니다. SKIP_LOCKED로 테이블 잠금 충돌 시 건너뛰며, 병렬 작업자는 0개, 버퍼 링은 1MB로 제한합니다. 인덱스 등에서의 모든 대기를 없애는 옵션은 아닙니다. 임시 정보 정리는 중복 실행 잠금, 1초 잠금 대기, 예약 호출의 60초 실행 제한을 사용합니다.

매일 관리만으로 전체 이력 조회량 증가를 해결하는 것은 아닙니다. 이 기능은 내부 불필요한 행 버전과 오래된 통계의 누적을 줄이며, 조회 구조 및 네트워크 처리량 개선과 함께 유지해야 합니다.

## 확인 및 중지

Supabase Cron에서 아래 두 작업의 실행 결과와 시간을 확인합니다. 예약은 DB의 GMT 기준 21:30, 21:35이며 한국시간으로 다음 날 06:30, 06:35입니다. 동일한 이름으로 설정을 다시 적용하면 작업을 갱신하며 중복 생성하지 않습니다.

```sql
select job.jobname, run.status, run.start_time, run.end_time, run.return_message
from cron.job job
left join cron.job_run_details run on run.jobid = job.jobid
where job.jobname in ('seungjin-daily-maintenance-cleanup', 'seungjin-daily-maintenance-vacuum')
order by run.start_time desc nulls last
limit 20;
```

중지가 필요하면 기존 백업 작업을 건드리지 않고 두 작업만 비활성화합니다.

```sql
select cron.alter_job(jobid, active := false)
from cron.job
where jobname in ('seungjin-daily-maintenance-cleanup', 'seungjin-daily-maintenance-vacuum');
```

`tests/daily-database-maintenance.sql`은 활성/만료 유예 기간 보호, 최대 1,000건 처리, 재고·백업 보존, 외부 API 실행 권한 차단을 확인합니다. 테스트용 행과 모든 변경은 마지막 ROLLBACK으로 취소됩니다. VACUUM은 트랜잭션 내 실행할 수 없으므로 별도 Cron 실행으로 검증합니다.

2026-09-29 운영 검증: SQL 통합 검사 통과, 기존 Node 테스트 496개 통과, 보안 점검 경고 0건. 동일한 명령으로 등록한 임시 Cron의 정리 작업은 18.418ms, VACUUM ANALYZE는 734.067ms에 성공했습니다. 검증용 예약은 확인 후 제거하고 매일 실행되는 두 예약만 유지합니다. 소요 시간은 이번 데이터와 부하에서의 측정치이며 일일 실행의 고정 보장 시간은 아닙니다.

참고: [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart), [PostgreSQL VACUUM](https://www.postgresql.org/docs/17/sql-vacuum.html).
