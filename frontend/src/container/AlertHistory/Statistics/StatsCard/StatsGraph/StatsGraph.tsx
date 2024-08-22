import { Color } from '@signozhq/design-tokens';
import Uplot from 'components/Uplot';
import { useResizeObserver } from 'hooks/useDimensions';
import { useMemo, useRef } from 'react';
import { AlertRuleStats } from 'types/api/alerts/def';

type Props = {
	timeSeries: AlertRuleStats['currentTriggersSeries']['values'];
	changeDirection: number;
};

const getStyle = (
	changeDirection: number,
): { stroke: string; fill: string } => {
	if (changeDirection === 0) {
		return {
			stroke: Color.BG_VANILLA_400,
			fill: 'rgba(255, 255, 255, 0.20)',
		};
	}
	if (changeDirection > 0) {
		return {
			stroke: Color.BG_FOREST_500,
			fill: 'rgba(37, 225, 146, 0.20)',
		};
	}
	return {
		stroke: Color.BG_CHERRY_500,
		fill: ' rgba(229, 72, 77, 0.20)',
	};
};

function StatsGraph({ timeSeries, changeDirection }: Props): JSX.Element {
	const { xData, yData } = useMemo(
		() => ({
			xData: timeSeries.map((item) => item.timestamp),
			yData: timeSeries.map((item) => Number(item.value)),
		}),
		[timeSeries],
	);

	const graphRef = useRef<HTMLDivElement>(null);

	const containerDimensions = useResizeObserver(graphRef);

	return (
		<div style={{ height: '100%', width: '100%' }} ref={graphRef}>
			<Uplot
				data={[xData, yData]}
				options={{
					width: containerDimensions.width,
					height: containerDimensions.height,

					legend: {
						show: false,
					},
					cursor: {
						x: false,
						y: false,
						drag: {
							x: false,
							y: false,
						},
					},
					series: [{}, getStyle(changeDirection)],
					axes: [
						{ show: false },
						{
							show: false,
						},
					],
				}}
			/>
		</div>
	);
}

export default StatsGraph;
