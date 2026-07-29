import { IconArrowLeft } from "@tabler/icons-react";
import { useNavigate, useParams } from "react-router";
import { CabinetHost, getCabinetRegistration } from "../cabinets/registry.tsx";
import { getVenueForCabinet, getVenueTableForCabinet } from "../venues/registry.ts";

export function CabinetRoute({ privatePreview = false }: { privatePreview?: boolean }) {
  const navigate = useNavigate();
  const { cabinetId = "" } = useParams<{ cabinetId: string }>();
  const registration = getCabinetRegistration(cabinetId, privatePreview);
  const venue = getVenueForCabinet(cabinetId);
  const status = getVenueTableForCabinet(cabinetId)?.status;
  const preparing = Boolean(status && status !== "open");
  if (!registration) return <main className="blocked-cabinet"><IconArrowLeft size={36} /><h1>{preparing ? "개장 준비 중입니다." : "이 게임은 공개되어 있지 않습니다."}</h1><p>저장된 데이터는 그대로 보존되며, 공개 로비에서는 열 수 없습니다.</p><button onClick={() => navigate(venue ? `/venues/${venue.id}` : "/")}>{venue ? "카지노로 돌아가기" : "로비로 돌아가기"}</button></main>;
  return <CabinetHost cabinetId={registration.manifest.id} onExit={() => navigate(privatePreview ? "/dev" : venue ? `/venues/${venue.id}` : "/")} />;
}
