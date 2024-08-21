/* eslint-disable no-nested-ternary */
import { Color } from '@signozhq/design-tokens';
import { Card, Typography } from 'antd';
import { FontSize } from 'container/OptionsMenu/types';
import styled from 'styled-components';

interface LogTextProps {
	linesPerRow?: number;
}

interface LogContainerProps {
	fontSize: FontSize;
}

export const Container = styled(Card)<{
	$isActiveLog: boolean;
	$isDarkMode: boolean;
}>`
	width: 100% !important;
	margin-bottom: 0.3rem;
	cursor: pointer;
	.ant-card-body {
		padding: 0.3rem 0.6rem;

		${({ $isActiveLog, $isDarkMode }): string =>
			$isActiveLog
				? `background-color: ${
						$isDarkMode ? Color.BG_SLATE_500 : Color.BG_VANILLA_300
				  } !important`
				: ''}
	}
`;

export const Text = styled(Typography.Text)`
	&&& {
		min-width: 2.5rem;
		white-space: nowrap;
	}
`;

export const TextContainer = styled.div`
	display: flex;
	overflow: hidden;
	width: 100%;
`;

export const LogContainer = styled.div<LogContainerProps>`
	margin-left: 0.5rem;
	display: flex;
	flex-direction: column;
	gap: 6px;
	${({ fontSize }): string =>
		fontSize === FontSize.SMALL
			? `gap: 2px;`
			: fontSize === FontSize.MEDIUM
			? ` gap:4px;`
			: `gap:6px;`}
`;

export const LogText = styled.div<LogTextProps>`
	display: inline-block;
	text-overflow: ellipsis;
	overflow: hidden;
	${({ linesPerRow }): string =>
		linesPerRow
			? `-webkit-line-clamp: ${linesPerRow};
		line-clamp: ${linesPerRow};
		display: -webkit-box;
		-webkit-box-orient: vertical;
		white-space: normal; `
			: 'white-space: nowrap;'};
	};
`;

export const SelectedLog = styled.div`
	display: flex;
	width: 100%;
	overflow: hidden;
`;
