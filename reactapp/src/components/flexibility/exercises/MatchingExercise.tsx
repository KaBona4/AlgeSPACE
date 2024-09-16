import { AgentCondition, AgentType, IsolatedIn, MatchingExerciseState, Method, SelectedEquation } from "@/types/flexibility/enums.ts";
import { ReactElement, useMemo, useState } from "react";
import { MatchingExercise as MatchingExerciseProps } from "@/types/flexibility/matchingExercise.ts";
import { getRandomAgent, setPKExerciseCompleted, setFlexibilityStudyExerciseCompleted } from "@utils/storageUtils.ts";
import { useAuth } from "@/contexts/AuthProvider.tsx";
import { GameError, GameErrorType } from "@/types/shared/error.ts";
import useFlexibilityTracker from "@hooks/useFlexibilityTracker.ts";
import { IUser } from "@/types/studies/user.ts";
import { FlexibilityExerciseActionPhase, FlexibilityExerciseChoicePhase, FlexibilityExercisePhase, FlexibilityStudyExerciseType } from "@/types/studies/enums.ts";
import { SystemTransformation } from "@components/flexibility/system/SystemTransformation.tsx";
import { FlexibilityEquation as FlexibilityEquationProps, FlexibilityEquation } from "@/types/math/linearEquation.ts";
import { EqualizationMethod } from "@components/flexibility/equalization/EqualizationMethod.tsx";
import { SubstitutionMethod } from "@components/flexibility/substitution/SubstitutionMethod.tsx";
import { SubstitutionParameters } from "@/types/flexibility/substitutionParameters.ts";
import { EliminationMethod } from "@components/flexibility/elimination/EliminationMethod.tsx";
import { EliminationParameters } from "@/types/flexibility/eliminationParameters.ts";
import { FirstSolution } from "@components/flexibility/solution/FirstSolution.tsx";
import { EquationSelection } from "@components/flexibility/solution/EquationSelection.tsx";
import { determineSecondEquation } from "@utils/utils.ts";
import { SecondSolution } from "@components/flexibility/solution/SecondSolution.tsx";
import { EfficiencyExerciseEnd } from "@components/flexibility/solution/EfficiencyExerciseEnd.tsx";
import { SystemSelection } from "@components/flexibility/choice/SystemSelection.tsx";
import { SelfExplanationForSystemMatching } from "@components/flexibility/choice/SelfExplanationExercise.tsx";

export function MatchingExercise({ flexibilityExerciseId, exercise, condition, handleEnd, isStudy = false, studyId }: {
    flexibilityExerciseId: number,
    exercise: MatchingExerciseProps;
    condition: AgentCondition;
    handleEnd: () => void;
    isStudy?: boolean;
    studyId?: number;
}): ReactElement {
    const agentType: AgentType | undefined = useMemo(() => {
        if (condition !== AgentCondition.None) {
            return getRandomAgent(isStudy ? sessionStorage : localStorage);
        }
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const { user } = useAuth();
    if (isStudy) {
        if (user === undefined) {
            throw new GameError(GameErrorType.AUTH_ERROR);
        }
        if (studyId === undefined) {
            throw new GameError(GameErrorType.STUDY_ID_ERROR);
        }
    }

    const {
        trackActionInPhase,
        trackChoice,
        trackErrorInPhase,
        setNextTrackingPhase,
        endTrackingPhase,
        endTracking
    } = useFlexibilityTracker(isStudy, user as IUser, studyId as number, flexibilityExerciseId, exercise.id, FlexibilityStudyExerciseType.Matching, performance.now(), condition, agentType, FlexibilityExercisePhase.SystemSelection);

    const randomOrder = useMemo(() => {
        return getRandomOrder(exercise.alternativeSystems.length + 1);
    }, [exercise.alternativeSystems.length]);

    const [exerciseState, setExerciseState] = useState<MatchingExerciseState>(MatchingExerciseState.SystemSelection);
    const [transformedSystem, setTransformedSystem] = useState<[FlexibilityEquation, FlexibilityEquation]>();
    const [isolatedVariables, setIsolatedVariables] = useState<[IsolatedIn, IsolatedIn]>([exercise.firstEquationIsIsolatedIn, exercise.secondEquationIsIsolatedIn]);
    const [methodApplicationResult, setMethodApplicationResult] = useState<[FlexibilityEquation, boolean]>();
    const [substitutionInfo, setSubstitutionInfo] = useState<SubstitutionParameters | undefined>();
    const [selectedEquation, setSelectedEquation] = useState<[FlexibilityEquation, SelectedEquation] | undefined>();

    let content: ReactElement;
    switch (exerciseState) {
        case MatchingExerciseState.SystemSelection: {
            content = (
                <SystemSelection
                    firstEquation={exercise.firstEquation}
                    secondEquation={exercise.secondEquation}
                    method={exercise.method}
                    alternativeSystems={exercise.alternativeSystems}
                    randomOrder={randomOrder}
                    loadNextStep={handleSelection}
                    question={exercise.question}
                    agentType={agentType}
                    additionalMessage={condition === AgentCondition.MotivationalAgent ? exercise.agentMessageForSelfExplanation : undefined}
                    trackAction={(action: string) => trackActionInPhase(action, FlexibilityExerciseActionPhase.SystemMatchingActions)}
                    trackError={trackErrorInPhase}
                    trackChoice={(choice: string) => trackChoice(choice, FlexibilityExerciseChoicePhase.SelfExplanationChoice)}
                />
            );
            break;
        }

        case MatchingExerciseState.SelfExplanation: {
            content = <SelfExplanationForSystemMatching
                method={exercise.method}
                firstEquation={exercise.firstEquation}
                secondEquation={exercise.secondEquation}
                alternativeSystems={exercise.alternativeSystems}
                selfExplanation={exercise.selfExplanationTask}
                loadNextStep={() => {
                    setNextTrackingPhase(FlexibilityExercisePhase.Transformation);
                    setExerciseState(MatchingExerciseState.SystemTransformation);
                }}
                agentType={agentType}
                trackAction={(action: string) => trackActionInPhase(action, FlexibilityExerciseActionPhase.SelfExplanationActions)}
                trackError={trackErrorInPhase}
            />;
            break;
        }

        case MatchingExerciseState.SystemTransformation: {
            content = (
                <SystemTransformation
                    firstEquation={exercise.firstEquation}
                    secondEquation={exercise.secondEquation}
                    firstVariable={exercise.firstVariable}
                    secondVariable={exercise.secondVariable}
                    method={exercise.method}
                    initialIsolatedVariables={isolatedVariables}
                    agentType={agentType}
                    loadNextStep={(transformedSystem?: [FlexibilityEquation, FlexibilityEquation], isolatedVariables?: [IsolatedIn, IsolatedIn]): void => {
                        setTransformedSystem(transformedSystem);
                        setExerciseState(() => assignStateByMethod(exercise.method, setNextTrackingPhase));
                        if (isolatedVariables !== undefined) {
                            setIsolatedVariables(isolatedVariables);
                        }
                    }}
                    trackAction={(action: string) => trackActionInPhase(action, FlexibilityExerciseActionPhase.TransformationActions)}
                    trackError={trackErrorInPhase}
                />
            );
            break;
        }

        case MatchingExerciseState.EqualizationMethod: {
            content = (
                <EqualizationMethod
                    initialSystem={[exercise.firstEquation, exercise.secondEquation]}
                    transformedSystem={transformedSystem}
                    agentType={agentType}
                    loadNextStep={(equation: FlexibilityEquation): void => {
                        setNextTrackingPhase(FlexibilityExercisePhase.FirstSolution);
                        const containsFirstVariable: boolean = isolatedVariables[0] !== IsolatedIn.First && isolatedVariables[0] !== IsolatedIn.FirstMultiple;
                        setMethodApplicationResult([equation, containsFirstVariable]);
                        setExerciseState(MatchingExerciseState.FirstSolution);
                    }}
                    trackAction={(action: string) => trackActionInPhase(action, FlexibilityExerciseActionPhase.EqualizationActions)}
                    trackError={trackErrorInPhase}
                />
            );
            break;
        }

        case MatchingExerciseState.SubstitutionMethod: {
            content = (
                <SubstitutionMethod
                    initialSystem={[exercise.firstEquation, exercise.secondEquation]}
                    transformedSystem={transformedSystem}
                    firstVariable={exercise.firstVariable}
                    secondVariable={exercise.secondVariable}
                    isolatedVariables={isolatedVariables}
                    agentType={agentType}
                    loadNextStep={(equation: FlexibilityEquation, containsFirst: boolean, params?: SubstitutionParameters): void => {
                        setNextTrackingPhase(FlexibilityExercisePhase.FirstSolution);
                        setMethodApplicationResult([equation, containsFirst]);
                        setExerciseState(MatchingExerciseState.FirstSolution);
                        setSubstitutionInfo(params);
                    }}
                    trackAction={(action: string) => trackActionInPhase(action, FlexibilityExerciseActionPhase.SubstitutionActions)}
                    trackError={trackErrorInPhase}
                />
            );
            break;
        }

        case MatchingExerciseState.EliminationMethod: {
            content = (
                <EliminationMethod
                    initialSystem={[exercise.firstEquation, exercise.secondEquation]}
                    transformedSystem={transformedSystem}
                    firstVariable={exercise.firstVariable}
                    secondVariable={exercise.secondVariable}
                    agentType={agentType}
                    loadNextStep={(equation: FlexibilityEquation, containsFirst: boolean, _?: EliminationParameters, firstMultipliedEquation?: FlexibilityEquationProps, secondMultipliedEquation?: FlexibilityEquationProps): void => {
                        setNextTrackingPhase(FlexibilityExercisePhase.FirstSolution);
                        setMethodApplicationResult([equation, containsFirst]);
                        if (firstMultipliedEquation !== undefined) {
                            if (secondMultipliedEquation !== undefined) {
                                setTransformedSystem([firstMultipliedEquation, secondMultipliedEquation]);
                            } else {
                                const secondTransformedEquation = transformedSystem !== undefined ? transformedSystem[1] : exercise.secondEquation;
                                setTransformedSystem([firstMultipliedEquation, secondTransformedEquation]);
                            }
                        } else if (secondMultipliedEquation !== undefined) {
                            const firstTransformedEquation = transformedSystem !== undefined ? transformedSystem[0] : exercise.firstEquation;
                            setTransformedSystem([firstTransformedEquation, secondMultipliedEquation]);
                        }
                        setExerciseState(MatchingExerciseState.FirstSolution);
                    }}
                    trackAction={(action: string) => trackActionInPhase(action, FlexibilityExerciseActionPhase.EliminationActions)}
                    trackError={trackErrorInPhase}
                />
            );
            break;
        }

        case MatchingExerciseState.FirstSolution: {
            if (methodApplicationResult === undefined) {
                throw new GameError(GameErrorType.GAME_LOGIC_ERROR);
            }
            content = (
                <FirstSolution
                    method={exercise.method}
                    initialSystem={[exercise.firstEquation, exercise.secondEquation]}
                    transformedSystem={transformedSystem}
                    methodEquation={methodApplicationResult[0]}
                    variable={methodApplicationResult[1] ? exercise.firstVariable : exercise.secondVariable}
                    agentType={agentType}
                    additionalMessage={condition === AgentCondition.MotivationalAgent ? exercise.agentMessageForFirstSolution : undefined}
                    loadNextStep={() => {
                        endTrackingPhase();
                        setExerciseState(MatchingExerciseState.EquationSelection);
                    }}
                    trackAction={(action: string) => trackActionInPhase(action, FlexibilityExerciseActionPhase.FirstSolutionActions)}
                    trackError={trackErrorInPhase}
                    trackChoice={(choice: string) => trackChoice(choice, FlexibilityExerciseChoicePhase.FirstSolutionChoice)}
                />
            );
            break;
        }

        case MatchingExerciseState.EquationSelection: {
            if (methodApplicationResult === undefined) {
                throw new GameError(GameErrorType.GAME_LOGIC_ERROR);
            }
            content = (
                <EquationSelection
                    method={exercise.method}
                    initialSystem={[exercise.firstEquation, exercise.secondEquation]}
                    transformedSystem={transformedSystem}
                    methodEquation={methodApplicationResult[0]}
                    firstSolutionVar={methodApplicationResult[1] ? exercise.firstVariable : exercise.secondVariable}
                    otherVariable={methodApplicationResult[1] ? exercise.secondVariable : exercise.firstVariable}
                    substitutionInfo={substitutionInfo}
                    loadNextStep={(selectedEquation: SelectedEquation): void => {
                        trackActionInPhase(`${SelectedEquation[selectedEquation]}`, FlexibilityExerciseActionPhase.EquationSelection);
                        setNextTrackingPhase(FlexibilityExercisePhase.SecondSolution);
                        setExerciseState(MatchingExerciseState.SecondSolution);
                        determineSecondEquation(selectedEquation, setSelectedEquation, exercise, transformedSystem);
                    }}
                />
            );
            break;
        }

        case MatchingExerciseState.SecondSolution: {
            if (methodApplicationResult === undefined || selectedEquation === undefined) {
                throw new GameError(GameErrorType.GAME_LOGIC_ERROR);
            }
            content = (
                <SecondSolution
                    method={exercise.method}
                    initialSystem={[exercise.firstEquation, exercise.secondEquation]}
                    transformedSystem={transformedSystem}
                    methodEquation={methodApplicationResult[0]}
                    selectedEquation={selectedEquation[0]}
                    firstSolutionVariable={methodApplicationResult[1] ? exercise.firstVariable : exercise.secondVariable}
                    otherVariable={methodApplicationResult[1] ? exercise.secondVariable : exercise.firstVariable}
                    substitutionInfo={substitutionInfo}
                    agentType={agentType}
                    additionalMessage={condition === AgentCondition.MotivationalAgent ? exercise.agentMessageForSecondSolution : undefined}
                    loadNextStep={() => {
                        endTrackingPhase();
                        setExerciseState(MatchingExerciseState.SystemSolution);
                    }}
                    trackAction={(action: string) => trackActionInPhase(action, FlexibilityExerciseActionPhase.SecondSolutionActions)}
                    trackError={trackErrorInPhase}
                    trackChoice={(choice: string) => trackChoice(choice, FlexibilityExerciseChoicePhase.SecondSolutionChoice)}
                />
            );
            break;
        }

        case MatchingExerciseState.SystemSolution: {
            if (methodApplicationResult === undefined || selectedEquation === undefined) {
                throw new GameError(GameErrorType.GAME_LOGIC_ERROR);
            }
            content = (
                <EfficiencyExerciseEnd
                    method={exercise.method}
                    initialSystem={[exercise.firstEquation, exercise.secondEquation]}
                    transformedSystem={transformedSystem}
                    methodEquation={methodApplicationResult[0]}
                    selectedEquation={selectedEquation[0]}
                    firstSolutionVar={methodApplicationResult[1] ? exercise.firstVariable : exercise.secondVariable}
                    firstSolutionIsFirstVariable={methodApplicationResult[1]}
                    otherVariable={methodApplicationResult[1] ? exercise.secondVariable : exercise.firstVariable}
                    agentType={agentType}
                    loadNextStep={() => {
                        endTracking();
                        handleExerciseEnd();
                    }}
                    substitutionInfo={substitutionInfo}
                />
            );
            break;
        }
    }

    return content;

    function handleSelection(selfExplain: boolean): void {
        if (selfExplain) {
            setNextTrackingPhase(FlexibilityExercisePhase.SelfExplanation);
            setExerciseState(MatchingExerciseState.SelfExplanation);
        } else {
            setNextTrackingPhase(FlexibilityExercisePhase.Transformation);
            setExerciseState(MatchingExerciseState.SystemTransformation);
        }
    }

    function handleExerciseEnd(): void {
        if (isStudy) {
            setFlexibilityStudyExerciseCompleted(studyId as number, flexibilityExerciseId);
        } else {
            setPKExerciseCompleted(flexibilityExerciseId, "flexibility-training");
        }
        handleEnd();
    }
}

function getRandomOrder(length: number): number[] {
    const array = Array.from({ length: length }, (_, i) => i);
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];  // Swap elements
    }
    return array;
}

function assignStateByMethod(method: Method, setNextTrackingPhase: (newPhase: FlexibilityExercisePhase) => void): MatchingExerciseState {
    switch (method) {
        case Method.Equalization:
            setNextTrackingPhase(FlexibilityExercisePhase.Equalization);
            return MatchingExerciseState.EqualizationMethod;

        case Method.Substitution:
            setNextTrackingPhase(FlexibilityExercisePhase.Substitution);
            return MatchingExerciseState.SubstitutionMethod;

        case Method.Elimination:
            setNextTrackingPhase(FlexibilityExercisePhase.Elimination);
            return MatchingExerciseState.EliminationMethod;
    }
}
