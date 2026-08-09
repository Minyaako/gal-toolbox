import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  useSettings,
  type DensityPreference,
  type ImageQualityPreference,
  type MotionPreference,
  type PrefetchPreference,
  type UserSettings,
} from "../app/settings";
import { queryCacheSummary } from "../queries";

type RadioOption<T extends string> = {
  value: T;
  label: string;
  note: string;
};

function PreferenceGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  children,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly RadioOption<T>[];
  onChange: (value: T) => void;
  children?: ReactNode;
}) {
  return <fieldset className="settings-group">
    <legend>{legend}</legend>
    <div className="settings-options">
      {options.map((option) => <label key={option.value}>
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={value === option.value}
          onChange={() => onChange(option.value)}
        />
        <span><strong>{option.label}</strong><small>{option.note}</small></span>
      </label>)}
    </div>
    {children}
  </fieldset>;
}

const motionOptions: readonly RadioOption<MotionPreference>[] = [
  { value: "full", label: "完整", note: "约 500ms 双层斜切色幕" },
  { value: "reduced", label: "简化", note: "约 120ms 淡入淡出" },
  { value: "off", label: "关闭", note: "立即切换页面" },
];

const imageOptions: readonly RadioOption<ImageQualityPreference>[] = [
  { value: "data-saver", label: "节省流量", note: "优先缩略图与延迟加载" },
  { value: "balanced", label: "平衡", note: "按展示位置选择加载时机" },
  { value: "high", label: "高清", note: "优先使用原尺寸图像" },
];

const prefetchOptions: readonly RadioOption<PrefetchPreference>[] = [
  { value: "data-saver", label: "节省流量", note: "仅在按下链接时准备资料" },
  { value: "balanced", label: "平衡", note: "指向、聚焦或按下时准备资料" },
  { value: "aggressive", label: "积极", note: "卡片出现后即开始准备资料" },
];

const densityOptions: readonly RadioOption<DensityPreference>[] = [
  { value: "comfortable", label: "舒展", note: "更宽松的内容间距" },
  { value: "standard", label: "标准", note: "默认信息密度" },
  { value: "compact", label: "紧凑", note: "在一屏显示更多内容" },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { settings, setSettings, clearSettings } = useSettings();
  const [, refreshCacheSummary] = useState(0);

  useEffect(() => queryClient.getQueryCache().subscribe(() => {
    refreshCacheSummary((revision) => revision + 1);
  }), [queryClient]);

  const summary = queryCacheSummary(queryClient);
  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateMotion = (motion: MotionPreference) => {
    setSettings((current) => ({
      ...current,
      motion,
      allowFullMotion: motion === "full" ? true : current.allowFullMotion,
    }));
  };

  const clearPreferencesAndCache = () => {
    const confirmed = globalThis.confirm?.(
      "确定清理本地偏好与查询缓存吗？当前页面可能需要重新加载资料。",
    ) ?? false;
    if (!confirmed) return;
    queryClient.clear();
    clearSettings();
  };

  return <section className="settings-page" aria-labelledby="settings-title">
    <header className="page-heading">
      <p>04 / Reading preferences</p>
      <h1 id="settings-title">设置</h1>
      <p>偏好仅保存在这台设备上，不改变公开 API 请求或分页数量。</p>
    </header>

    <div className="settings-grid">
      <PreferenceGroup
        legend="页面转场"
        name="motion"
        value={settings.motion}
        options={motionOptions}
        onChange={updateMotion}
      >
        <label className="settings-override">
          <input
            type="checkbox"
            checked={settings.allowFullMotion}
            disabled={settings.motion !== "full"}
            onChange={(event) => update("allowFullMotion", event.currentTarget.checked)}
          />
          即使系统偏好减少动态，也明确允许完整动效
        </label>
      </PreferenceGroup>
      <PreferenceGroup
        legend="图片质量"
        name="image-quality"
        value={settings.imageQuality}
        options={imageOptions}
        onChange={(value) => update("imageQuality", value)}
      />
      <PreferenceGroup
        legend="预加载强度"
        name="prefetch"
        value={settings.prefetch}
        options={prefetchOptions}
        onChange={(value) => update("prefetch", value)}
      />
      <PreferenceGroup
        legend="界面密度"
        name="density"
        value={settings.density}
        options={densityOptions}
        onChange={(value) => update("density", value)}
      />
    </div>

    <section className="settings-cache" aria-labelledby="cache-title">
      <div>
        <h2 id="cache-title">缓存概览</h2>
        <p>{summary.total} 项查询 · {summary.active} 项正在使用 · {summary.fetching} 项加载中</p>
        {summary.failed ? <p>{summary.failed} 项查询最近失败，进入对应页面时可重试。</p> : null}
      </div>
      <button type="button" onClick={clearPreferencesAndCache}>
        清理本地偏好与查询缓存
      </button>
    </section>
  </section>;
}
